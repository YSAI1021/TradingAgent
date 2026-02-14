import { createContext, useContext, useState, useEffect } from 'react';

const TimezoneContext = createContext();

export const useTimezone = () => {
  const context = useContext(TimezoneContext);
  if (!context) {
    throw new Error('useTimezone must be used within TimezoneProvider');
  }
  return context;
};

export const TimezoneProvider = ({ children }) => {
  // Load timezone preference from localStorage, default to 'local'
  const [timezone, setTimezone] = useState(() => {
    const saved = localStorage.getItem('timezone');
    return saved || 'local';
  });

  // Save timezone preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('timezone', timezone);
  }, [timezone]);

  const toggleTimezone = () => {
    setTimezone(prev => prev === 'local' ? 'America/New_York' : 'local');
  };

  const value = {
    timezone,
    setTimezone,
    toggleTimezone,
    isEST: timezone === 'America/New_York'
  };

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  );
};
