import { useCallback, useRef, useState } from 'react';

import { getAttachmentUrl } from '@/lib/api-client';

interface AudioPlayerProps {
  driveId: string;
  name: string;
  projectId: string;
}

function getAudioMimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    webm: 'audio/webm',
  };
  return mimeMap[ext ?? ''] ?? 'audio/mpeg';
}

export function AudioPlayer({ driveId, name, projectId }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const src = getAttachmentUrl(
    projectId,
    driveId,
    getAudioMimeType(name),
    name,
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      audio.play().catch(() => {
        setIsPlaying(false);
      });
    }
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <div
        role="progressbar"
        aria-valuenow={Math.round(currentTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        className="h-1.5 flex-1 rounded bg-gray-200"
      >
        <div
          className="h-full rounded bg-primary transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <audio
        ref={audioRef}
        src={src}
        role="audio"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />
    </div>
  );
}

export type { AudioPlayerProps };
