
import { 
    VideoAnalysisReport, ReportStatus, ViolationSeverity, DetectedViolation,
    // FIX: Import newly added types
    Project, ProjectStatus, JSA, Camera, CameraStatus
} from '../types';

// Mock Data Store
let mockVideoAnalysisReports: VideoAnalysisReport[] = [];
// FIX: Added mock data stores for projects, cameras, and JSAs
let mockProjects: Project[] = [];
let mockCameras: Camera[] = [];
// Storing JSAs linked to projects directly or as a separate collection if needed.
// For simplicity with current usage, JSA is part of Project. This mockJSAs can be used if JSA needs to be managed independently.
// let mockJSAs: Record<string, JSA | undefined> = {}; 

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const apiService = {
  // --- Video Analysis Report CRUD (Kept) ---
  addVideoAnalysisReport: async (reportData: Omit<VideoAnalysisReport, 'id'>): Promise<VideoAnalysisReport> => {
    await delay(400);
    const newReport: VideoAnalysisReport = { 
        ...reportData, 
        id: `var-${Date.now()}`,
        analysisDateTime: new Date().toISOString(), // Ensure analysisDateTime is always current on add
    };
    mockVideoAnalysisReports.push(newReport);
    return newReport;
  },

  getVideoAnalysisReportById: async (id: string): Promise<VideoAnalysisReport | undefined> => {
    await delay(200);
    return mockVideoAnalysisReports.find(r => r.id === id);
  },
  
  getAllVideoAnalysisReports: async (): Promise<VideoAnalysisReport[]> => {
    await delay(100);
    // Return a copy to prevent direct modification of the store
    return [...mockVideoAnalysisReports].sort((a, b) => new Date(b.analysisDateTime).getTime() - new Date(a.analysisDateTime).getTime());
  },

  getVideoAnalysisReportsByVideoId: async (videoId: string): Promise<VideoAnalysisReport[]> => {
    await delay(300);
    return mockVideoAnalysisReports.filter(r => r.videoId === videoId);
  },

  updateVideoAnalysisReport: async (id: string, updates: Partial<VideoAnalysisReport>): Promise<VideoAnalysisReport> => {
    await delay(300);
    const reportIndex = mockVideoAnalysisReports.findIndex(r => r.id === id);
    if (reportIndex === -1) {
        throw new Error("Report not found for update.");
    }
    // Preserve original analysisDateTime, only update if explicitly provided in 'updates'
    const originalReport = mockVideoAnalysisReports[reportIndex];
    mockVideoAnalysisReports[reportIndex] = { 
        ...originalReport, 
        ...updates,
        // If analysisDateTime is part of updates, it will override. Otherwise, original is kept.
        // If you want to force update analysisDateTime on every 'update' operation:
        // analysisDateTime: new Date().toISOString(), 
    };
    return mockVideoAnalysisReports[reportIndex];
  },

  // FIX: Added mock implementations for missing API methods
  addProject: async (projectData: Omit<Project, 'id' | 'jsa'>): Promise<Project> => {
    await delay(300);
    const newProject: Project = {
      ...projectData,
      id: `proj-${Date.now()}`,
      status: projectData.status || ProjectStatus.Active, // Ensure status has a default
    };
    mockProjects.push(newProject);
    return newProject;
  },

  updateProject: async (id: string, updates: Partial<Omit<Project, 'id' | 'jsa'>>): Promise<Project> => {
    await delay(300);
    const projectIndex = mockProjects.findIndex(p => p.id === id);
    if (projectIndex === -1) throw new Error("Project not found");
    mockProjects[projectIndex] = { ...mockProjects[projectIndex], ...updates };
    return mockProjects[projectIndex];
  },

  uploadJSA: async (projectId: string, file: File): Promise<JSA> => {
    await delay(500);
    const project = mockProjects.find(p => p.id === projectId);
    if (!project) throw new Error("Project not found for JSA upload");

    const newJSA: JSA = {
      id: `jsa-${Date.now()}`,
      fileName: file.name,
      filePath: `/uploads/jsa/${projectId}/${file.name}`, // Mock path
      uploadedAt: new Date().toISOString(),
    };
    // Associate JSA with the project
    project.jsa = newJSA; 
    // If maintaining a separate JSA store: mockJSAs[projectId] = newJSA;
    return newJSA;
  },

  addCamera: async (cameraData: Omit<Camera, 'id'>): Promise<Camera> => {
    await delay(300);
    const newCamera: Camera = {
      ...cameraData,
      id: `cam-${Date.now()}`,
    };
    mockCameras.push(newCamera);
    return newCamera;
  },

  updateCamera: async (id: string, updates: Partial<Omit<Camera, 'id'>>): Promise<Camera> => {
    await delay(300);
    const cameraIndex = mockCameras.findIndex(c => c.id === id);
    if (cameraIndex === -1) throw new Error("Camera not found");
    mockCameras[cameraIndex] = { ...mockCameras[cameraIndex], ...updates };
    return mockCameras[cameraIndex];
  }
};