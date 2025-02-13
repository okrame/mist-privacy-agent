import React, { useState, useEffect } from 'react';
import './styles.css';

const ModeToggle = ({ mode, onToggle }) => {
  const [isChecked, setIsChecked] = useState(mode !== 'normal');
  
  useEffect(() => {
    setIsChecked(mode !== 'normal');
  }, [mode]);

  const handleChange = (e) => {
    setIsChecked(!isChecked);
    onToggle();
  };

  return (
    <div className="mode-toggle">
      <div className="toggle-container">
        <span className="toggle-label">Pro (beta)</span>
        <label className="toggle-switch">
          <input 
            type="checkbox"
            checked={isChecked}
            onChange={handleChange}
          />
          <span className="slider round"></span>
        </label>
      </div>
    </div>
  );
};

export default ModeToggle;