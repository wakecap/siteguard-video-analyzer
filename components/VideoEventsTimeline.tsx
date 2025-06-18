
import React from 'react';
import { DetectedViolation, ViolationSeverity } from '../types';

interface VideoEventsTimelineProps {
  violations: DetectedViolation[];
  videoDuration: number;
  onEventSelect: (violation: DetectedViolation) => void;
}

const VIOLATION_SEVERITY_TIMELINE_COLORS: Record<ViolationSeverity, string> = {
  [ViolationSeverity.Critical]: 'bg-danger-500 hover:bg-danger-600',
  [ViolationSeverity.High]: 'bg-danger-400 hover:bg-danger-500',
  [ViolationSeverity.Medium]: 'bg-warning-400 hover:bg-warning-500',
  [ViolationSeverity.Low]: 'bg-success-400 hover:bg-success-500',
  [ViolationSeverity.Info]: 'bg-primary-400 hover:bg-primary-500',
};

const formatTime = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(hours.toString().padStart(2, '0'));
  }
  parts.push(minutes.toString().padStart(2, '0'));
  parts.push(seconds.toString().padStart(2, '0'));
  return parts.join(':');
};

const VideoEventsTimeline: React.FC<VideoEventsTimelineProps> = ({ violations, videoDuration, onEventSelect }) => {
  if (videoDuration <= 0) {
    return <p className="text-sm text-secondary-500">Video duration not available for timeline.</p>;
  }
  if (!violations || violations.length === 0) {
    return <p className="text-sm text-secondary-500">No events to display on timeline.</p>;
  }

  const timelineMarkersCount = 5; // Number of markers on the timeline
  const markerInterval = videoDuration / timelineMarkersCount;

  return (
    <div className="w-full bg-secondary-200 rounded-lg p-3 relative select-none">
      {/* Timeline track */}
      <div className="h-6 bg-secondary-300 rounded-full relative">
        {violations.map((violation, index) => {
          const leftPercentage = (violation.startTimeSeconds / videoDuration) * 100;
          const widthPercentage = (violation.durationSeconds / videoDuration) * 100;

          // Ensure width is at least a minimum value for visibility, e.g., 0.5%
          const minWidthPercentage = 0.5;
          const displayWidthPercentage = Math.max(widthPercentage, minWidthPercentage);
          
          // Prevent event from overflowing timeline
          const effectiveLeftPercentage = Math.max(0, Math.min(leftPercentage, 100 - displayWidthPercentage));


          return (
            <button
              key={index}
              onClick={() => onEventSelect(violation)}
              className={`absolute top-0 h-full rounded-sm transition-all duration-150 ease-in-out
                ${VIOLATION_SEVERITY_TIMELINE_COLORS[violation.severity] || 'bg-secondary-400 hover:bg-secondary-500'}
                focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-500 z-10`}
              style={{
                left: `${effectiveLeftPercentage}%`,
                width: `${displayWidthPercentage}%`,
              }}
              title={`${violation.severity}: ${violation.description.substring(0,50)}... (${formatTime(violation.startTimeSeconds)} - ${formatTime(violation.endTimeSeconds)})`}
              aria-label={`Event: ${violation.description}, Severity: ${violation.severity}, Time: ${formatTime(violation.startTimeSeconds)} to ${formatTime(violation.endTimeSeconds)}`}
            >
              {/* Optional: Show tiny text if width allows */}
              {/* {widthPercentage > 5 && <span className="text-xs text-white truncate px-1">{violation.severity}</span>} */}
            </button>
          );
        })}
      </div>
      {/* Time Markers */}
      <div className="flex justify-between mt-1 text-xs text-secondary-600">
        {Array.from({ length: timelineMarkersCount + 1 }).map((_, i) => (
          <span key={i} className="transform -translate-x-1/2 first:translate-x-0 last:-translate-x-full">
            {formatTime(i * markerInterval)}
          </span>
        ))}
      </div>
    </div>
  );
};

export default VideoEventsTimeline;
