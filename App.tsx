
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// Only import types and services relevant to VideoAnalysisPage and core app functionality
import { ToastMessage, VideoAnalysisReport, DetectedViolation, ViolationSeverity, ReportStatus } from './types';
import { apiService } from './services/apiService';
import { analyzeUploadedVideo, uploadVideoFile } from './services/geminiService';
import { AppName, VideoAnalysisIcon } from './constants'; // Keep only used constants
import Modal from './components/Modal';
import VideoEventsTimeline from './components/VideoEventsTimeline'; // Import the new timeline component

// --- Re-usable Components (kept from original App.tsx as they are used by VideoAnalysisPage) ---

const LoadingSpinner: React.FC<{size?: 'small' | 'medium'; className?: string}> = ({size = 'medium', className = ''}) => {
  const sizeClasses = size === 'small' ? 'h-5 w-5 border-2' : 'h-12 w-12 border-t-2 border-b-2';
  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div className={`animate-spin rounded-full ${sizeClasses} border-primary-600`}></div>
    </div>
  );
};

const Toast: React.FC<{ toast: ToastMessage; onClose: () => void }> = ({ toast, onClose }) => {
  const bgColor = {
    success: 'bg-success-500',
    error: 'bg-danger-500',
    warning: 'bg-warning-500',
    info: 'bg-primary-500',
  }[toast.type];

  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`p-4 rounded-md text-white ${bgColor} shadow-lg flex justify-between items-center`}>
      <span>{toast.message}</span>
      <button onClick={onClose} className="ml-4 text-xl font-bold">&times;</button>
    </div>
  );
};


// --- Video Analysis Specific Helper Functions and Components (from original App.tsx) ---

interface ParsedAnalysisResult {
    summary?: string;
    safetyScore?: number;
    violations: DetectedViolation[];
    positiveObservations?: string[];
    error?: string;
    rawResponse?: string;
}

// Helper function to capture a frame from a video element at a specific time
const captureFrameAtTime = (videoElement: HTMLVideoElement, timeSeconds: number): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    if (!videoElement || videoElement.readyState < videoElement.HAVE_METADATA) {
      if (videoElement && videoElement.readyState < videoElement.HAVE_METADATA) {
           const initialReadyState = videoElement.readyState;
           const onLoadedMetadata = () => {
               videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
               clearTimeout(metaTimeout);
               proceedWithCapture();
           }
           videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
           if (initialReadyState === videoElement.HAVE_NOTHING && !videoElement.currentSrc) {
                videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                resolve(null); 
                return;
           }
            const metaTimeout = setTimeout(() => {
                videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                console.warn("Timeout waiting for loadedmetadata for frame capture.");
                resolve(null); 
            }, 5000); // Increased timeout for metadata
           return; 
      } else if (!videoElement) {
          resolve(null);
          return;
      }
    }
    
    proceedWithCapture();

    function proceedWithCapture() {
        const wasPaused = videoElement.paused;
        if (!wasPaused) videoElement.pause();

        const onSeeked = () => {
            videoElement.removeEventListener('seeked', onSeeked);
            videoElement.removeEventListener('error', onErrorCapture);
            clearTimeout(seekTimeoutId);

            requestAnimationFrame(() => { 
                const canvas = document.createElement('canvas');
                canvas.width = videoElement.videoWidth;
                canvas.height = videoElement.videoHeight;

                if (canvas.width === 0 || canvas.height === 0) {
                    if (!wasPaused && videoElement.isConnected) videoElement.play().catch(e => console.warn("Frame capture: Failed to resume playback", e));
                    resolve(null);
                    return;
                }

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                } else {
                    resolve(null);
                }
                if (!wasPaused && videoElement.isConnected) videoElement.play().catch(e => console.warn("Frame capture: Failed to resume playback after capture", e));
            });
        };

        const onErrorCapture = (e: Event) => {
            videoElement.removeEventListener('seeked', onSeeked);
            videoElement.removeEventListener('error', onErrorCapture);
            clearTimeout(seekTimeoutId);
            console.error(`Error seeking video to ${timeSeconds}s for frame capture:`, e);
            if (!wasPaused && videoElement.isConnected) videoElement.play().catch(playErr => console.warn("Frame capture: Failed to resume playback after error", playErr));
            reject(new Error('Video seeking error during frame capture.'));
        };
        
        videoElement.addEventListener('seeked', onSeeked);
        videoElement.addEventListener('error', onErrorCapture);
        
        videoElement.currentTime = timeSeconds;

        const seekTimeoutId = setTimeout(() => {
            videoElement.removeEventListener('seeked', onSeeked);
            videoElement.removeEventListener('error', onErrorCapture);
            console.warn(`Timeout waiting for seek event (to ${timeSeconds}s) for frame capture.`);
            if (!wasPaused && videoElement.isConnected) videoElement.play().catch(e => console.warn("Frame capture: Failed to resume playback after timeout", e));
            reject(new Error('Timeout during frame capture seeking.'));
        }, 7000); 
    }
  });
};

// This is the content of the former VideoAnalysisPage component
const VideoAnalysisFeature: React.FC<{ addToast: (message: string, type?: ToastMessage['type']) => void; }> = ({ addToast }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const evidenceVideoPlayerRef = useRef<HTMLVideoElement>(null);
  const [jsaContext, setJsaContext] = useState<string>("");
  const [userInstructionPrompt, setUserInstructionPrompt] = useState<string>("Summarize this video focusing on safety. Identify violations and positive practices.");
  
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [uploadedFileDetails, setUploadedFileDetails] = useState<{name: string, uri: string, videoId: string, mimeType: string} | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ParsedAnalysisResult | null>(null);
  const [rawGeminiResponse, setRawGeminiResponse] = useState<string | null>(null);
  
  const [savedReport, setSavedReport] = useState<VideoAnalysisReport | null>(null); // For the current analysis being worked on
  const [operatorComments, setOperatorComments] = useState<string>("");
  const [currentReportStatus, setCurrentReportStatus] = useState<ReportStatus>(ReportStatus.PendingReview);

  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [evidenceViolation, setEvidenceViolation] = useState<DetectedViolation | null>(null);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);

  const [allSavedReports, setAllSavedReports] = useState<VideoAnalysisReport[]>([]);
  const [selectedReportForViewing, setSelectedReportForViewing] = useState<VideoAnalysisReport | null>(null);


  const loadAllSavedReports = useCallback(async () => {
    try {
      const reports = await apiService.getAllVideoAnalysisReports();
      setAllSavedReports(reports);
    } catch (error: any) {
      addToast(`Failed to load saved reports: ${error.message}`, "error");
    }
  }, [addToast]);

  useEffect(() => {
    loadAllSavedReports();
  }, [loadAllSavedReports]);

  const resetFormState = (keepHistorySelection = false) => {
    setSelectedFile(null);
    if (videoSrc) URL.revokeObjectURL(videoSrc); // Ensure old object URLs are revoked
    setVideoSrc(null);
    setJsaContext("");
    setUserInstructionPrompt("Summarize this video focusing on safety. Identify violations and positive practices.");
    setIsUploading(false);
    setIsAnalyzing(false);
    setUploadedFileDetails(null);
    setAnalysisResult(null);
    setRawGeminiResponse(null);
    setSavedReport(null);
    setOperatorComments("");
    setCurrentReportStatus(ReportStatus.PendingReview);
    setIsGeneratingThumbnails(false);
    if (!keepHistorySelection) {
        setSelectedReportForViewing(null);
    }
  };
  
  const handleSelectReportFromHistory = (report: VideoAnalysisReport) => {
    resetFormState(true); // Reset most of the form but keep history selection active
    setSelectedReportForViewing(report);
    
    // Populate displayed fields from the selected historical report
    setAnalysisResult({ // Simulate ParsedAnalysisResult from VideoAnalysisReport
        summary: report.summary,
        safetyScore: report.safetyScore,
        violations: report.violations,
        positiveObservations: report.positiveObservations,
        rawResponse: report.geminiRawResponse // Store geminiRawResponse here for consistency if needed, though rawResponseToDisplay handles it
    });
    setRawGeminiResponse(report.geminiRawResponse); // Keep this for saving logic perhaps, or simplify
    setOperatorComments(report.operatorComments || "");
    setCurrentReportStatus(report.reportStatus);
    setSavedReport(report); // This report is now the "active" one for updates
    
    // For viewing the video of a historical report:
    // This is tricky in a pure frontend mock. If videoFileUri was a direct URL or if we had local file access, we could setVideoSrc.
    // For now, the video player will show the last uploaded video.
    // If report.videoFileUri is usable and we want to try loading it:
    // if(report.videoFileUri) setVideoSrc(report.videoFileUri); // This would only work if it's a web-accessible URL
    // We'll keep videoSrc as is, so timeline clicks apply to the current video.
    // The user knows they selected a historical report.
    addToast(`Displaying historical report: ${report.videoFileName}`, "info");

    // If the selected historical report's video file is the one currently selected, set up for it
    if (selectedFile && selectedFile.name === report.videoFileName && uploadedFileDetails?.videoId === report.videoId) {
        // Video is already loaded, ensure videoSrc is set if it got cleared
        if (!videoSrc && selectedFile) setVideoSrc(URL.createObjectURL(selectedFile));
    } else {
        // If we had a mechanism to fetch/load the historical video file based on report.videoId or report.videoFileUri,
        // it would go here. For now, we clear selectedFile to indicate the player might not match the report.
        // setSelectedFile(null); 
        // if(videoSrc) URL.revokeObjectURL(videoSrc);
        // setVideoSrc(null);
        // For now, don't change videoSrc automatically to avoid confusion. The user can re-upload if needed.
    }

  };


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === "video/mp4" || file.type === "video/webm" || file.type === "video/ogg" || file.type.startsWith("video/")) { // Broaden accepted types slightly
        resetFormState(); 
        setSelectedFile(file);
        const objectURL = URL.createObjectURL(file);
        setVideoSrc(objectURL);
      } else {
        addToast("Invalid file type. Please select an MP4, WebM, Ogg or other common video file.", "error");
        setSelectedFile(null);
        if (videoSrc) URL.revokeObjectURL(videoSrc);
        setVideoSrc(null);
      }
    }
  };

  const handleAnalyzeVideo = async () => {
    if (!selectedFile) {
      addToast("Please select a video file first.", "warning");
      return;
    }
    // FIX: Check API_KEY from window context using type assertion for TypeScript
    const apiKeyFromWindow = (window as any).process?.env?.API_KEY;
    if (!apiKeyFromWindow || apiKeyFromWindow === "YOUR_GEMINI_API_KEY") {
      addToast("Gemini API Key is not configured or is a placeholder. Video analysis cannot proceed.", "error");
      return;
    }
    
    // Clear previous results related to history selection before new analysis
    setSelectedReportForViewing(null);
    setSavedReport(null); // Clear any existing saved report context

    setIsUploading(true);
    setIsAnalyzing(false);
    setAnalysisResult(null);
    setRawGeminiResponse(null);
    addToast(`Uploading video: ${selectedFile.name}...`, "info");

    try {
      const uploadedInfo = await uploadVideoFile(selectedFile, selectedFile.name);
      setUploadedFileDetails(uploadedInfo); // includes mimeType from upload
      addToast(`Video "${uploadedInfo.name}" uploaded successfully. Starting analysis...`, "success");
      
      setIsUploading(false);
      setIsAnalyzing(true);
      
      const geminiJsonString = await analyzeUploadedVideo(uploadedInfo.uri, uploadedInfo.mimeType, jsaContext, userInstructionPrompt);
      setRawGeminiResponse(geminiJsonString);

      try {
        const parsed: ParsedAnalysisResult = JSON.parse(geminiJsonString);
        if (parsed.error) {
            addToast(`Analysis Error: ${parsed.error}`, "error");
            setAnalysisResult({ violations: [], ...parsed });
        } else {
            setAnalysisResult(parsed); 
            addToast("Video analysis complete! Generating event thumbnails...", "success");
        }
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON response:", parseError, "\nRaw response:", geminiJsonString);
        addToast("Failed to parse analysis result from Gemini.", "error");
        setAnalysisResult({ error: "Failed to parse analysis result.", violations: [], rawResponse: geminiJsonString });
      }

    } catch (error: any) {
      console.error("Video analysis process failed:", error);
      const errorMessage = error?.message || "Failed to upload or analyze video.";
      setAnalysisResult({ error: errorMessage, violations: [] });
      addToast(errorMessage, "error");
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };
  
  useEffect(() => {
    const currentAnalysisResult = selectedReportForViewing ? {violations: selectedReportForViewing.violations} : analysisResult;
    const currentVideoPlayer = videoPlayerRef.current;

    if (currentAnalysisResult?.violations && currentAnalysisResult.violations.length > 0 && videoSrc && currentVideoPlayer) {
      const violationsWithoutThumbnails = currentAnalysisResult.violations.filter(v => !v.hasOwnProperty('thumbnailDataUrl'));

      if (violationsWithoutThumbnails.length > 0) {
        setIsGeneratingThumbnails(true);
        addToast(`Generating ${violationsWithoutThumbnails.length} thumbnail(s)...`, "info")

        const generateAllThumbnails = async () => {
          if (!currentVideoPlayer) {
            setIsGeneratingThumbnails(false);
            return;
          }
          // Ensure video is ready for frame capture
          if (currentVideoPlayer.readyState < currentVideoPlayer.HAVE_METADATA) {
            await new Promise<void>(resolve => {
              const onLoaded = () => {
                currentVideoPlayer.removeEventListener('loadedmetadata', onLoaded);
                currentVideoPlayer.removeEventListener('error', onLoadedError);
                resolve();
              };
              const onLoadedError = () => {
                 currentVideoPlayer.removeEventListener('loadedmetadata', onLoaded);
                 currentVideoPlayer.removeEventListener('error', onLoadedError);
                 addToast("Video metadata error, cannot generate thumbnails.", "error");
                 resolve(); // resolve to stop further processing
              }
              currentVideoPlayer.addEventListener('loadedmetadata', onLoaded);
              currentVideoPlayer.addEventListener('error', onLoadedError);
            });
          }
          if (currentVideoPlayer.readyState < currentVideoPlayer.HAVE_METADATA) { // Double check after await
             setIsGeneratingThumbnails(false); return;
          }
          
          let updatedViolations = [...currentAnalysisResult.violations];
          let thumbnailsGeneratedCount = 0;

          for (let i = 0; i < updatedViolations.length; i++) {
            const violation = updatedViolations[i];
            if (!violation.hasOwnProperty('thumbnailDataUrl')) { 
              try {
                const thumbnailUrl = await captureFrameAtTime(currentVideoPlayer, violation.startTimeSeconds);
                updatedViolations[i] = { ...violation, thumbnailDataUrl: thumbnailUrl };
                if (thumbnailUrl) thumbnailsGeneratedCount++;
              } catch (thumbError) {
                console.warn(`Could not generate thumbnail for violation "${violation.description}" at ${violation.startTimeSeconds}s:`, thumbError);
                updatedViolations[i] = { ...violation, thumbnailDataUrl: null }; 
              }
            }
          }
          
          // Update the correct state based on whether we're viewing a live analysis or historical one
          if (selectedReportForViewing) {
            const updatedHistoricalReport = { ...selectedReportForViewing, violations: updatedViolations };
            setSelectedReportForViewing(updatedHistoricalReport);
            // Also update `allSavedReports` if this report is in there
            setAllSavedReports(prev => prev.map(r => r.id === updatedHistoricalReport.id ? updatedHistoricalReport : r));
             // If this historical report is also the one set in `savedReport` (meaning it's "active" for updates)
            if (savedReport && savedReport.id === updatedHistoricalReport.id) {
                setSavedReport(updatedHistoricalReport);
            }
          } else if (analysisResult) { // Live analysis result
            setAnalysisResult(prev => prev ? { ...prev, violations: updatedViolations } : null);
          }

          setIsGeneratingThumbnails(false);
          if (thumbnailsGeneratedCount > 0) {
            addToast(`${thumbnailsGeneratedCount} thumbnail(s) generated.`, "success");
          }
          if (thumbnailsGeneratedCount < violationsWithoutThumbnails.length) {
             addToast(`Failed to generate ${violationsWithoutThumbnails.length - thumbnailsGeneratedCount} thumbnail(s).`, "warning");
          }
        };

        if (currentVideoPlayer.readyState >= currentVideoPlayer.HAVE_CURRENT_DATA || currentVideoPlayer.readyState >= currentVideoPlayer.HAVE_METADATA ) {
            generateAllThumbnails();
        } else {
            const onCanPlay = () => {
                generateAllThumbnails();
                currentVideoPlayer.removeEventListener('canplaythrough', onCanPlay); 
                currentVideoPlayer.removeEventListener('loadeddata', onCanPlay); // Alternative event
                currentVideoPlayer.removeEventListener('error', onCanPlayError);
            };
            const onCanPlayError = () => {
                 addToast("Video player error, cannot generate thumbnails.", "error");
                 setIsGeneratingThumbnails(false);
                 currentVideoPlayer.removeEventListener('canplaythrough', onCanPlay);
                 currentVideoPlayer.removeEventListener('loadeddata', onCanPlay);
                 currentVideoPlayer.removeEventListener('error', onCanPlayError);
            }
            currentVideoPlayer.addEventListener('canplaythrough', onCanPlay);
            currentVideoPlayer.addEventListener('loadeddata', onCanPlay); // Listen to loadeddata as well
            currentVideoPlayer.addEventListener('error', onCanPlayError);
        }
      }
    }
  }, [analysisResult, selectedReportForViewing, videoSrc, addToast, savedReport]);


  const handleSaveReport = async () => {
    // Determine if we are saving a new analysis or updating a loaded historical one
    // const currentData = selectedReportForViewing || analysisResult; // analysisResult holds new data if not viewing history
    const currentFile = selectedFile; // Only relevant for new analysis
    const currentUploadedDetails = uploadedFileDetails; // Only relevant for new analysis

    // FIX: Correctly check for error on analysisResult when saving a new report
    // Property 'error' does not exist on type 'VideoAnalysisReport'.
    // This condition should only apply when saving a new analysis result.
    if (!selectedReportForViewing && analysisResult && analysisResult.error && (!analysisResult.violations || analysisResult.violations.length === 0)) {
        addToast("Cannot save report with critical analysis errors and no violation data.", "error");
        return;
    }
    
    if (!selectedReportForViewing && (!analysisResult || (!currentFile || !currentUploadedDetails))) {
         addToast("No new analysis result or file details to save.", "warning");
         return;
    }


    const videoDuration = videoPlayerRef.current?.duration;

    if (selectedReportForViewing) { // This means we are updating an already "saved" report (loaded from history)
        if(!savedReport || savedReport.id !== selectedReportForViewing.id) {
            addToast("Inconsistent state: trying to update a historical report that is not set as active.", "error");
            return;
        }
        handleUpdateReport(); // Use the existing update logic, which uses 'savedReport' state
        return;
    }

    // Saving a new analysis
    if (!currentFile || !currentUploadedDetails || !analysisResult) { // ensure analysisResult is present for new save
         addToast("Missing file, upload details, or analysis results for new report.", "error");
         return;
    }

    const reportToSave: Omit<VideoAnalysisReport, 'id'> = {
        videoId: currentUploadedDetails.videoId,
        videoFileName: currentFile.name,
        videoFileUri: currentUploadedDetails.uri,
        analysisDateTime: new Date().toISOString(),
        jsaContext: jsaContext,
        userPrompt: userInstructionPrompt,
        geminiRawResponse: rawGeminiResponse || JSON.stringify(analysisResult), // Use rawGeminiResponse state or stringify analysisResult
        summary: analysisResult.summary,
        safetyScore: analysisResult.safetyScore,
        violations: analysisResult.violations || [],
        positiveObservations: analysisResult.positiveObservations,
        operatorComments: operatorComments, 
        reportStatus: currentReportStatus, 
        videoDurationSeconds: videoDuration && Number.isFinite(videoDuration) ? videoDuration : undefined,
    };

    try {
        const newSavedReport = await apiService.addVideoAnalysisReport(reportToSave);
        setSavedReport(newSavedReport); // Set this as the current "active" saved report
        setOperatorComments(newSavedReport.operatorComments || ""); 
        setCurrentReportStatus(newSavedReport.reportStatus);
        addToast("Analysis report saved successfully!", "success");
        loadAllSavedReports(); // Refresh history list
    } catch (error: any) {
        addToast(`Failed to save report: ${error.message}`, "error");
    }
  };

  const handleUpdateReport = async () => {
    if (!savedReport) { // savedReport is the "active" report, could be from new save or loaded from history
        addToast("No report selected to update.", "warning");
        return;
    }
    try {
        const updatedData: Partial<VideoAnalysisReport> = {
            operatorComments: operatorComments,
            reportStatus: currentReportStatus,
            // If thumbnails were generated for a historical report, violations might be updated
            violations: selectedReportForViewing?.id === savedReport.id ? selectedReportForViewing.violations : savedReport.violations,
        };

        const updated = await apiService.updateVideoAnalysisReport(savedReport.id, updatedData);
        setSavedReport(updated);
        if (selectedReportForViewing && selectedReportForViewing.id === updated.id) {
            setSelectedReportForViewing(updated); // Keep historical view in sync
        }
        addToast("Report updated successfully!", "success");
        loadAllSavedReports(); // Refresh history list
    } catch (error: any) {
        addToast(`Failed to update report: ${error.message}`, "error");
    }
  };

  const handleViewEvidence = (violation: DetectedViolation) => {
    setEvidenceViolation(violation);
    setIsEvidenceModalOpen(true);
  };
  
  useEffect(() => {
    if (isEvidenceModalOpen && evidenceViolation && evidenceVideoPlayerRef.current && videoSrc) {
      const player = evidenceVideoPlayerRef.current;
      const targetTime = evidenceViolation.startTimeSeconds;
      
      const setTime = () => {
        if(player.readyState >= player.HAVE_METADATA) { 
            player.currentTime = targetTime;
        }
      };

      if(player.readyState >= player.HAVE_METADATA) {
          setTime();
      } else {
          const onLoadedMetadata = () => {
              setTime();
              player.removeEventListener('loadedmetadata', onLoadedMetadata);
          };
          player.addEventListener('loadedmetadata', onLoadedMetadata);
      }
    }
  }, [isEvidenceModalOpen, evidenceViolation, videoSrc]);


  const handleTimelineEventClick = (violation: DetectedViolation) => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = violation.startTimeSeconds;
      videoPlayerRef.current.play().catch(e => console.warn("Playback prevented on timeline click:", e));
      addToast(`Seeking to ${violation.startTimeSeconds.toFixed(1)}s: ${violation.description.substring(0,30)}...`, "info");
    }
  };

  // FIX: Use type assertion for window.process to correctly check API_KEY for UI warning
  const apiKeyFromWindow = (window as any).process?.env?.API_KEY;
  const isApiKeyConfigured = apiKeyFromWindow && apiKeyFromWindow !== "YOUR_GEMINI_API_KEY";
  const canProcess = isApiKeyConfigured && !isUploading && !isAnalyzing && !isGeneratingThumbnails;

  useEffect(() => {
    const currentVideoSrc = videoSrc; // Capture current videoSrc
    return () => {
      // This cleanup runs when videoSrc changes OR component unmounts
      if (currentVideoSrc && currentVideoSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentVideoSrc);
      }
    };
  }, [videoSrc]); // Depend only on videoSrc

  const VIOLATION_SEVERITY_COLORS: Record<ViolationSeverity, string> = {
    [ViolationSeverity.Critical]: 'bg-danger-500 text-white',
    [ViolationSeverity.High]: 'bg-danger-300 text-danger-900',
    [ViolationSeverity.Medium]: 'bg-warning-400 text-warning-900',
    [ViolationSeverity.Low]: 'bg-success-300 text-success-900',
    [ViolationSeverity.Info]: 'bg-primary-300 text-primary-900',
  };

  // Data for display (either live analysis or selected historical report)
  const displayData = selectedReportForViewing || analysisResult;
  const displayReportName = selectedReportForViewing?.videoFileName || uploadedFileDetails?.name || selectedFile?.name;
  const displayVideoDuration = selectedReportForViewing?.videoDurationSeconds || videoPlayerRef.current?.duration;

  // FIX: Consolidate logic for accessing raw response for display
  // This will hold the raw response string from either a historical report or a new analysis.
  const rawResponseToDisplay = useMemo(() => {
    if (selectedReportForViewing) {
      return selectedReportForViewing.geminiRawResponse;
    }
    if (analysisResult && analysisResult.rawResponse) {
      return analysisResult.rawResponse;
    }
    return null;
  }, [selectedReportForViewing, analysisResult]);


  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column: Controls and History */}
      <div className="lg:col-span-1 space-y-6">
        {!isApiKeyConfigured && (
          <div className="bg-warning-50 p-4 rounded-md border border-warning-300 text-warning-700">
              <p className="font-semibold">Warning: Gemini API Key is not configured correctly.</p>
              <p className="text-sm">Please ensure your `API_KEY` is properly set up (e.g., in `index.html` or environment) to enable video analysis features.</p>
          </div>
        )}

        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <h2 className="text-lg font-semibold text-secondary-800 border-b pb-2 mb-3">Video Analysis Setup</h2>
          <div>
            <label htmlFor="videoFile" className="block text-sm font-medium text-secondary-700 mb-1">1. Upload Video (MP4, WebM, etc.)</label>
            <input
              type="file" id="videoFile" accept="video/*" onChange={handleFileChange}
              className="block w-full text-sm text-secondary-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 disabled:opacity-50"
              disabled={!canProcess && (!!selectedFile || isUploading || isAnalyzing || isGeneratingThumbnails)}
            />
            {selectedFile && <p className="mt-1 text-xs text-secondary-500">Selected: {selectedFile.name}</p>}
          </div>

          {videoSrc && (
              <div className="mt-4">
                  <h3 className="text-md font-medium text-secondary-700 mb-2">Video Preview:</h3>
                  <video ref={videoPlayerRef} src={videoSrc} controls muted playsInline preload="metadata" className="w-full rounded-md aspect-video bg-secondary-900" />
              </div>
          )}

          <div>
            <label htmlFor="jsaContext" className="block text-sm font-medium text-secondary-700 mb-1">2. JSA / Hazard Context (Optional)</label>
            <textarea
              id="jsaContext" rows={4} value={jsaContext} onChange={(e) => setJsaContext(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:bg-secondary-50"
              placeholder="Paste JSA text or describe specific hazards to look for..."
              disabled={!canProcess || !!selectedReportForViewing}
            />
          </div>

          <div>
            <label htmlFor="userInstructionPrompt" className="block text-sm font-medium text-secondary-700 mb-1">3. Specific Instructions for Gemini (Optional)</label>
            <textarea
              id="userInstructionPrompt" rows={3} value={userInstructionPrompt} onChange={(e) => setUserInstructionPrompt(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:bg-secondary-50"
              placeholder="e.g., Focus on ladder safety. Identify anyone not using three points of contact."
              disabled={!canProcess || !!selectedReportForViewing}
            />
          </div>

          <button
            onClick={handleAnalyzeVideo}
            disabled={!selectedFile || !canProcess || !!selectedReportForViewing}
            className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition flex items-center justify-center shadow disabled:opacity-50"
            title={selectedReportForViewing ? "Clear history selection to analyze a new video" : ""}
          >
            {(isUploading || isAnalyzing) ? <LoadingSpinner size="small" className="mr-2"/> : <VideoAnalysisIcon className="w-5 h-5 mr-2" />}
            {isUploading ? 'Uploading...' : isAnalyzing ? 'Analyzing with Gemini...' : 'Upload and Analyze Video'}
          </button>
           {selectedReportForViewing && (
                <button 
                    onClick={() => resetFormState(false)} 
                    className="w-full mt-2 px-4 py-2 text-sm bg-secondary-200 text-secondary-700 rounded-md hover:bg-secondary-300 transition"
                >
                    Clear Selection & Analyze New
                </button>
            )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow space-y-3">
          <h2 className="text-lg font-semibold text-secondary-800 border-b pb-2 mb-3">Saved Reports History</h2>
          {allSavedReports.length === 0 && <p className="text-sm text-secondary-500">No reports saved yet.</p>}
          <ul className="max-h-96 overflow-y-auto space-y-2">
            {allSavedReports.map(report => (
              <li key={report.id}>
                <button
                  onClick={() => handleSelectReportFromHistory(report)}
                  className={`w-full text-left p-3 rounded-md transition-colors ${selectedReportForViewing?.id === report.id ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500' : 'bg-secondary-50 hover:bg-secondary-100 text-secondary-700'}`}
                >
                  <span className="font-medium block text-sm">{report.videoFileName}</span>
                  <span className="text-xs text-secondary-500 block">
                    {new Date(report.analysisDateTime).toLocaleString()} - {report.violations.length} violations
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right Column: Analysis Results */}
      <div className="lg:col-span-2 space-y-6">
        {(isUploading || isAnalyzing || isGeneratingThumbnails) && !selectedReportForViewing && (
          <div className="bg-white p-6 rounded-lg shadow text-center">
            <LoadingSpinner />
            <p className="text-secondary-600 mt-2">
              {isUploading ? `Uploading "${selectedFile?.name}"... This may take a while.` : 
              isAnalyzing ? 'Gemini is processing the video... This can take several minutes.' :
              isGeneratingThumbnails ? 'Generating event thumbnails...' : ''}
            </p>
          </div>
        )}
        
        {isGeneratingThumbnails && selectedReportForViewing && (
             <div className="bg-white p-4 rounded-lg shadow text-center">
                <LoadingSpinner size="small" />
                <p className="text-secondary-600 mt-1 text-sm">Generating thumbnails for selected report...</p>
            </div>
        )}


        {displayData && !isUploading && !isAnalyzing && (!isGeneratingThumbnails || (isGeneratingThumbnails && selectedReportForViewing)) && (
          <div className="bg-white p-6 rounded-lg shadow mt-0 space-y-6">
            <h3 className="text-xl font-semibold text-secondary-800">Analysis Results for "{displayReportName}"</h3>
            
            {/* FIX: Use type guard 'in' operator to check for 'error' property.
                This ensures 'error' and 'rawResponse' are only accessed if displayData is ParsedAnalysisResult.
                Error in file App.tsx on line 691: Property 'error' does not exist on type 'VideoAnalysisReport | ParsedAnalysisResult'.
                Error in file App.tsx on line 694: Property 'error' does not exist on type 'VideoAnalysisReport | ParsedAnalysisResult'.
                Error in file App.tsx on line 695: Property 'rawResponse' does not exist on type 'VideoAnalysisReport | ParsedAnalysisResult'.
            */}
            {displayData && 'error' in displayData && displayData.error && (
              <div className="bg-danger-50 p-3 rounded-md border border-danger-200 text-danger-700">
                <p className="font-semibold">Analysis Error:</p>
                <p className="text-sm">{displayData.error}</p> {/* displayData is now known to be ParsedAnalysisResult */}
                {/* displayData.rawResponse is valid here as displayData is ParsedAnalysisResult */}
                {displayData.rawResponse && (
                    <details className="mt-2 text-xs">
                        <summary>Show Raw Response</summary>
                        <pre className="whitespace-pre-wrap bg-secondary-100 p-2 rounded mt-1">{displayData.rawResponse}</pre>
                    </details>
                )}
              </div>
            )}

            {displayData.summary && (
              <div>
                <h4 className="text-lg font-semibold text-secondary-700">Summary:</h4>
                <p className="text-secondary-600 mt-1 prose prose-sm max-w-none">{displayData.summary}</p>
              </div>
            )}

            {displayData.safetyScore !== undefined && (
              <div>
                <h4 className="text-lg font-semibold text-secondary-700">Safety Score:</h4>
                <p className={`text-2xl font-bold mt-1 ${displayData.safetyScore >= 80 ? 'text-success-600' : displayData.safetyScore >= 50 ? 'text-warning-600' : 'text-danger-600'}`}>
                  {displayData.safetyScore} / 100
                </p>
              </div>
            )}
            
            {/* Video Events Timeline */}
            {displayData.violations && displayData.violations.length > 0 && displayVideoDuration && Number.isFinite(displayVideoDuration) && displayVideoDuration > 0 && (
              <div>
                  <h4 className="text-lg font-semibold text-secondary-700 mb-2">Events Timeline:</h4>
                  <VideoEventsTimeline
                      violations={displayData.violations}
                      videoDuration={displayVideoDuration}
                      onEventSelect={handleTimelineEventClick}
                  />
              </div>
            )}


            <div>
              <h4 className="text-lg font-semibold text-secondary-700 mb-2">Detected Violations ({displayData.violations?.length || 0}):</h4>
              {displayData.violations && displayData.violations.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-secondary-200">
                    <thead className="bg-secondary-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-secondary-500 uppercase">Screenshot</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-secondary-500 uppercase">Description</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-secondary-500 uppercase">Severity</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-secondary-500 uppercase">Time (On-Screen / Video)</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-secondary-500 uppercase">Duration</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-secondary-500 uppercase">Evidence</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-secondary-200">
                      {displayData.violations.map((v, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 text-sm">
                            {v.thumbnailDataUrl === undefined && isGeneratingThumbnails && <LoadingSpinner size="small"/>}
                            {v.thumbnailDataUrl === undefined && !isGeneratingThumbnails && <span className="text-xs text-secondary-400 italic">No thumb yet</span>}
                            {v.thumbnailDataUrl === null && <span className="text-xs text-secondary-500">No thumb</span>}
                            {v.thumbnailDataUrl && 
                              <img 
                                  src={v.thumbnailDataUrl} 
                                  alt={`Violation: ${v.description.substring(0,30)}...`} 
                                  className="w-24 h-16 object-cover rounded-md shadow-sm cursor-pointer hover:ring-2 hover:ring-primary-500"
                                  onClick={() => handleViewEvidence(v)}
                                  aria-label={`Thumbnail for violation: ${v.description}`}
                              />
                            }
                          </td>
                          <td className="px-3 py-2 text-sm text-secondary-700 align-top">{v.description}</td>
                          <td className="px-3 py-2 text-sm align-top">
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${VIOLATION_SEVERITY_COLORS[v.severity] || 'bg-secondary-200 text-secondary-800'}`}>
                              {v.severity}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm text-secondary-600 align-top">
                            {(v.onScreenStartTime || v.onScreenEndTime) ? (
                              <>
                                {v.onScreenStartTime || '?'} - {v.onScreenEndTime || '?'} (On-Screen)
                                <br/>
                                <span className="text-xs text-secondary-400">({v.startTimeSeconds.toFixed(1)}s - {v.endTimeSeconds.toFixed(1)}s Video)</span>
                              </>
                            ) : (
                              <>{v.startTimeSeconds.toFixed(1)}s - {v.endTimeSeconds.toFixed(1)}s</>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm text-secondary-600 align-top">{v.durationSeconds.toFixed(1)}s</td>
                          <td className="px-3 py-2 text-sm align-top">
                            <button 
                              onClick={() => handleViewEvidence(v)}
                              disabled={!videoSrc}
                              className="text-primary-600 hover:text-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={videoSrc ? "View video evidence" : "Video preview not available for evidence"}
                            >View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-secondary-600">No violations detected or reported by the analysis.</p>
              )}
            </div>

            {displayData.positiveObservations && displayData.positiveObservations.length > 0 && (
              <div>
                <h4 className="text-lg font-semibold text-secondary-700">Positive Observations:</h4>
                <ul className="list-disc list-inside text-secondary-600 mt-1 space-y-1 prose prose-sm max-w-none">
                  {displayData.positiveObservations.map((obs, index) => <li key={index}>{obs}</li>)}
                </ul>
              </div>
            )}

            {/* FIX: Use rawResponseToDisplay which correctly gets raw response from historical or new analysis.
                Error in file App.tsx on line 805: Property 'rawResponse' does not exist on type 'VideoAnalysisReport | ParsedAnalysisResult'.
                Error in file App.tsx on line 808: Property 'rawResponse' does not exist on type 'VideoAnalysisReport | ParsedAnalysisResult'.
            */}
            {rawResponseToDisplay && (
              <details className="mt-4 text-xs">
                  <summary className="cursor-pointer text-secondary-600 hover:text-primary-700">Show Raw Gemini JSON Response</summary>
                  <pre className="whitespace-pre-wrap bg-secondary-100 p-3 rounded mt-1 text-secondary-700 max-h-60 overflow-auto">
                    {(() => {
                        try {
                            // Attempt to parse and pretty-print if it's JSON
                            return JSON.stringify(JSON.parse(rawResponseToDisplay), null, 2);
                        } catch (e) {
                            // Otherwise, show the raw string
                            return rawResponseToDisplay;
                        }
                    })()}
                  </pre>
              </details>
            )}

            <div className="pt-6 border-t border-secondary-200 mt-6 space-y-4">
              <h4 className="text-lg font-semibold text-secondary-700">Incident Management:</h4>
              <div>
                <label htmlFor="operatorComments" className="block text-sm font-medium text-secondary-700 mb-1">Operator Comments</label>
                <textarea
                  id="operatorComments" rows={3} value={operatorComments} onChange={(e) => setOperatorComments(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="Add any comments, actions taken, or follow-up needed..."
                />
              </div>
              <div>
                <label htmlFor="reportStatus" className="block text-sm font-medium text-secondary-700 mb-1">Report Status</label>
                <select
                  id="reportStatus" value={currentReportStatus} onChange={(e) => setCurrentReportStatus(e.target.value as ReportStatus)}
                  className="mt-1 block w-full px-3 py-2 border border-secondary-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                >
                  {Object.values(ReportStatus).map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div className="flex space-x-3">
                {(!savedReport || (selectedReportForViewing && savedReport?.id !== selectedReportForViewing.id)) && !selectedReportForViewing && ( // Show Save for new analysis
                  <button
                    onClick={handleSaveReport}
                    className="px-4 py-2 bg-success-600 text-white rounded-md hover:bg-success-700 transition shadow disabled:opacity-50"
                    disabled={!analysisResult || (!!analysisResult.error && (!analysisResult.violations || analysisResult.violations.length ===0))}
                  >
                    Save Analysis Report
                  </button>
                )}
                {/* Show Update if a report is "active" (either just saved, or loaded from history) */}
                {savedReport && (
                    <button
                        onClick={handleUpdateReport}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition shadow"
                    >
                        Update Report (ID: {savedReport.id.substring(0,10)}...)
                    </button>
                )}
              </div>
              {savedReport && <p className="text-xs text-success-700">Active Report ID: {savedReport.id}</p>}
            </div>
          </div>
        )}
      </div>


      {isEvidenceModalOpen && evidenceViolation && videoSrc && (
        <Modal 
            isOpen={isEvidenceModalOpen} 
            onClose={() => setIsEvidenceModalOpen(false)} 
            title={`Evidence for Violation: "${evidenceViolation.description.substring(0,50)}..."`}
        >
            <div className="space-y-3">
                {evidenceViolation.thumbnailDataUrl && (
                    <img 
                        src={evidenceViolation.thumbnailDataUrl} 
                        alt={`Screenshot: ${evidenceViolation.description}`} 
                        className="w-full rounded-md shadow-md mb-3"
                    />
                )}
                <video 
                    src={videoSrc} 
                    controls 
                    ref={evidenceVideoPlayerRef} 
                    className="w-full rounded-md aspect-video bg-secondary-900" 
                    preload="auto"
                    playsInline
                />
                <p><span className="font-semibold">Description:</span> {evidenceViolation.description}</p>
                <p><span className="font-semibold">Severity:</span> {evidenceViolation.severity}</p>
                <p><span className="font-semibold">On-Screen Time:</span> {evidenceViolation.onScreenStartTime || '?'} - {evidenceViolation.onScreenEndTime || '?'}</p>
                <p><span className="font-semibold">Video Time:</span> {evidenceViolation.startTimeSeconds.toFixed(1)}s - {evidenceViolation.endTimeSeconds.toFixed(1)}s ({evidenceViolation.durationSeconds.toFixed(1)}s duration)</p>
                 <button 
                    onClick={() => {
                        if(evidenceVideoPlayerRef.current) {
                             evidenceVideoPlayerRef.current.currentTime = evidenceViolation.startTimeSeconds;
                             evidenceVideoPlayerRef.current.play().catch(e => console.warn("Evidence modal replay prevented:", e));
                        }
                    }}
                    className="px-3 py-1.5 text-sm bg-primary-100 text-primary-700 rounded hover:bg-primary-200 transition"
                >
                    Replay from Start
                </button>
            </div>
        </Modal>
      )}
    </div>
  );
};


// --- Main App Component ---
const App: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);
  
  useEffect(() => {
    // FIX: Use type assertion for window.process to resolve TypeScript error and safely access API_KEY
    const currentWindow = window as any;
    const apiKeyFromWindow = currentWindow.process?.env?.API_KEY;

    // Check API_KEY from window.process.env (setup in index.html)
    if (apiKeyFromWindow === "YOUR_GEMINI_API_KEY") {
        addToast("Warning: Gemini API Key is a placeholder. Video analysis may not work. Please update index.html.", "warning");
    } else if (!apiKeyFromWindow) {
        // This case might not be hit if index.html always defines process.env.API_KEY, but good for robustness
        addToast("Error: Gemini API Key is not found. Video analysis will not work. Ensure API_KEY is set in index.html.", "error");
    }
  }, [addToast]);


  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-primary-700 text-white p-4 shadow-md sticky top-0 z-50 flex items-center justify-center">
        <VideoAnalysisIcon className="w-8 h-8 mr-3 text-white"/>
        <h1 className="text-2xl font-bold">{AppName}</h1>
      </header>
      <main className="flex-1 p-4 sm:p-6 bg-secondary-100">
        <VideoAnalysisFeature addToast={addToast} />
      </main>
      <div className="fixed bottom-4 right-4 space-y-2 w-full max-w-xs sm:max-w-sm z-[100]">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </div>
  );
};

export default App;
