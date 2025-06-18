
import React, { useState, useEffect } from 'react';
import { Camera, CameraStatus, Project } from '../types';
import { apiService } from '../services/apiService';

interface CameraFormProps {
  camera?: Camera | null;
  projects: Project[];
  onSave: (camera: Camera) => void;
  onCancel: () => void;
}

const CameraForm: React.FC<CameraFormProps> = ({ camera, projects, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [status, setStatus] = useState<CameraStatus>(CameraStatus.Online);
  const [locationDescription, setLocationDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (camera) {
      setName(camera.name);
      setRtspUrl(camera.rtspUrl);
      setProjectId(camera.projectId);
      setStatus(camera.status);
      setLocationDescription(camera.locationDescription);
    } else {
      setName('');
      setRtspUrl('');
      setProjectId(projects.length > 0 ? projects[0].id : '');
      setStatus(CameraStatus.Online);
      setLocationDescription('');
    }
  }, [camera, projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
        alert("Please select a project."); // Or handle more gracefully
        return;
    }
    setIsSaving(true);
    const cameraData = { name, rtspUrl, projectId, status, locationDescription };
    try {
      const savedCamera = camera?.id
        ? await apiService.updateCamera(camera.id, cameraData)
        : await apiService.addCamera(cameraData);
      onSave(savedCamera);
    } catch (error) {
      console.error("Failed to save camera:", error);
      // Show error toast
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="cameraName" className="block text-sm font-medium text-secondary-700">Camera Name</label>
        <input
          type="text"
          id="cameraName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
          required
        />
      </div>
      <div>
        <label htmlFor="rtspUrl" className="block text-sm font-medium text-secondary-700">RTSP Stream URL</label>
        <input
          type="url"
          id="rtspUrl"
          value={rtspUrl}
          onChange={(e) => setRtspUrl(e.target.value)}
          placeholder="rtsp://..."
          className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
          required
        />
      </div>
      <div>
        <label htmlFor="projectId" className="block text-sm font-medium text-secondary-700">Project</label>
        <select
          id="projectId"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-secondary-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
          required
        >
          <option value="" disabled>Select a project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="locationDescription" className="block text-sm font-medium text-secondary-700">Location Description</label>
        <textarea
          id="locationDescription"
          value={locationDescription}
          onChange={(e) => setLocationDescription(e.target.value)}
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
        />
      </div>
       <div>
        <label htmlFor="status" className="block text-sm font-medium text-secondary-700">Status</label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as CameraStatus)}
          className="mt-1 block w-full px-3 py-2 border border-secondary-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
        >
          {Object.values(CameraStatus).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex justify-end space-x-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-md shadow-sm hover:bg-secondary-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || !projectId}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Camera'}
        </button>
      </div>
    </form>
  );
};

export default CameraForm;
    