import React from 'react';
import { Circle, Disc } from 'lucide-react';

const ConfidenceScore = ({ score, maxScore = 5 }) => {
  return (
    <div className="flex items-center gap-1">
      {[...Array(maxScore)].map((_, index) => (
        index < score ? (
          <Disc
            key={index}
            size={16}
            fill="var(--app-accent)"
            color="var(--app-accent)"
          />
        ) : (
          <Circle
            key={index}
            size={16}
            color="var(--app-border)"
          />
        )
      ))}
    </div>
  );
};

export default ConfidenceScore;