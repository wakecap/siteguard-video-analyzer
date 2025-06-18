
import React, { useState, useEffect } from 'react';
import { Project, ProjectStatus, JSA } from '../types';
import { apiService } from '../services/apiService';

interface ProjectFormProps {
  project?: Project | null;
  onSave: (project: Project) => void;
  onCancel: () => void;
}

const ProjectForm: React.FC<ProjectFormProps> = ({ project, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>(ProjectStatus.Active);
  const [jsaFile, setJsaFile] = useState<File | null>(null);
  const [currentJSA, setCurrentJSA] = useState<JSA | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setLocation(project.location);
      setStartDate(project.startDate.split('T')[0]); // Format for date input
      setEndDate(project.endDate.split('T')[0]); // Format for date input
      setStatus(project.status);
      setCurrentJSA(project.jsa);
    } else {
      setName('');
      setLocation('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // Default to 30 days from now
      setStatus(ProjectStatus.Active);
      setCurrentJSA(undefined);
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    let savedProject: Project;
    const projectData = { name, location, startDate, endDate, status };

    try {
      if (project?.id) {
        savedProject = await apiService.updateProject(project.id, projectData);
      } else {
        savedProject = await apiService.addProject(projectData);
      }

      if (jsaFile && savedProject.id) {
        const uploadedJSA = await apiService.uploadJSA(savedProject.id, jsaFile);
        savedProject.jsa = uploadedJSA;
      } else if (project?.jsa) {
        savedProject.jsa = project.jsa; // Keep existing JSA if no new file
      }
      
      onSave(savedProject);
    } catch (error) {
      console.error("Failed to save project:", error);
      // Here you would typically show an error toast to the user
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setJsaFile(event.target.files[0]);
      setCurrentJSA({ id: 'new', fileName: event.target.files[0].name, filePath: '', uploadedAt: '' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="projectName" className="block text-sm font-medium text-secondary-700">Project Name</label>
        <input
          type="text"
          id="projectName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
          required
        />
      </div>
      <div>
        <label htmlFor="projectLocation" className="block text-sm font-medium text-secondary-700">Location</label>
        <input
          type="text"
          id="projectLocation"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
          required
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-secondary-700">Start Date</label>
          <input
            type="date"
            id="startDate"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            required
          />
        </div>
        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-secondary-700">End Date</label>
          <input
            type="date"
            id="endDate"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-secondary-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            required
          />
        </div>
      </div>
      <div>
        <label htmlFor="status" className="block text-sm font-medium text-secondary-700">Status</label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          className="mt-1 block w-full px-3 py-2 border border-secondary-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
        >
          {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
       <div>
        <label htmlFor="jsaFile" className="block text-sm font-medium text-secondary-700">Job Safety Analysis (JSA)</label>
        <input
          type="file"
          id="jsaFile"
          onChange={handleFileChange}
          accept=".pdf,.txt,.doc,.docx"
          className="mt-1 block w-full text-sm text-secondary-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
        />
        {currentJSA && (
          <p className="mt-2 text-sm text-secondary-600">Current JSA: {currentJSA.fileName} {currentJSA.id !== 'new' && `(uploaded ${new Date(currentJSA.uploadedAt).toLocaleDateString()})`}</p>
        )}
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
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Project'}
        </button>
      </div>
    </form>
  );
};

export default ProjectForm;
    