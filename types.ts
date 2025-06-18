
import React, { SVGProps } from 'react'; // Keep SVGProps for icon types

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

// --- Video Analysis Specific Types (Kept) ---
export enum ViolationSeverity {
    Critical = "Critical",
    High = "High",
    Medium = "Medium",
    Low = "Low",
    Info = "Info",
}

export interface DetectedViolation {
    description: string;
    startTimeSeconds: number;
    endTimeSeconds: number;
    durationSeconds: number;
    severity: ViolationSeverity;
    onScreenStartTime?: string; 
    onScreenEndTime?: string;   
    thumbnailDataUrl?: string | null; // Allow null for failed captures
}

export enum ReportStatus {
    PendingReview = "Pending Review",
    Reviewed = "Reviewed",
    ActionRequired = "Action Required",
    Closed = "Closed",
}

export interface VideoAnalysisReport {
    id: string;
    videoId: string; 
    videoFileName: string;
    videoFileUri?: string; 
    analysisDateTime: string;
    jsaContext?: string;
    userPrompt?: string;
    geminiRawResponse: string; 
    summary?: string;
    safetyScore?: number;
    violations: DetectedViolation[];
    positiveObservations?: string[];
    operatorComments?: string;
    reportStatus: ReportStatus;
    videoDurationSeconds?: number; // Added to store total video duration
}

// FIX: Added missing type definitions for Project, ProjectStatus, JSA, Camera, CameraStatus
// --- Project Specific Types ---
export enum ProjectStatus {
  Active = "Active",
  OnHold = "On Hold",
  Completed = "Completed",
  Cancelled = "Cancelled",
}

export interface JSA {
  id: string;
  fileName: string;
  filePath: string; // URL or path to the stored file
  uploadedAt: string; // ISO date string
}

export interface Project {
  id: string;
  name: string;
  location: string;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  status: ProjectStatus;
  jsa?: JSA;
}

// --- Camera Specific Types ---
export enum CameraStatus {
  Online = "Online",
  Offline = "Offline",
  Maintenance = "Maintenance",
  Error = "Error",
}

export interface Camera {
  id: string;
  name: string;
  rtspUrl: string;
  projectId: string; // Link to Project
  status: CameraStatus;
  locationDescription: string;
}
// SVGProps is re-exported implicitly by being imported, or explicitly if needed by other files (not in this case directly)
// If constants.tsx or other files directly import SVGProps from here, it's fine. Otherwise, this import might only be for local use.
// For this refactor, assuming it's mainly for VideoAnalysisIcon which is now in constants.tsx and imports SVGProps from 'react'.
// So, SVGProps here might not be strictly necessary if no other file imports it FROM types.ts.
// However, let's keep it to avoid breaking an implicit dependency if constants.tsx was changed to import SVGProps from './types'.
// On review, constants.tsx imports SVGProps from 'react', so this one can be removed if not used by other types within THIS file.
// Let's assume it's not needed here directly if only icons in constants.tsx use it.
// Re-evaluating: It's good practice if any type definition within this file needs SVGProps, to import it.
// Since no types here use SVGProps directly, it can be removed if VideoAnalysisIcon is self-contained or imports from 'react'.
// VideoAnalysisIcon in constants.tsx already imports SVGProps from 'react'.
// So, the import React, { SVGProps } from 'react'; is not strictly needed in types.ts anymore.
// Let's remove it from types.ts to keep it clean, as icon components manage their own SVGProps import.