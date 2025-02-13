// Spinner.jsx
import React from 'react';
import './styles.css'; 

const Spinner = ({ visible }) => {
  if (!visible) return null;
  
  return (
    <div className="spinner-container">
      <div className="spinner" />
    </div>
  );
};

export default Spinner;