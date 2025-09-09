
import React from 'react';

const LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA2AAAAByCAMAAAB4gr2vAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAPUExURf///8S3oW+Jb8S3oSGVAAAAEHRSTlMA////YBCgoO+QL4C/n4DwKx2kAAAD0ElEQVR4Xu3a25KiMBAFUEFYUVDx/k97oASCFDEONe3p1F31I/lJTdPT1jbb2Nra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2v7d5vN+nsAzM8DeAPwLp/fBfiY4B2At2Hk8SR4LgDehC98bicAnwP+1hGg2x/gW0GATwI+2l8BeBPgYwL8KMA3gWcE+FGAZwL8KHAS4GMCfCjgvwL8LMC7Ai9rCPAqwLsCv20JcCfgXUH6gQCfBvwowJcCfgzwsQCvArwK8LL+zwK8SvAu4HUBeBbgfYAnBfgXYBvgS4BvgS8BvgS+BDgjQAcB3gS4I0AHAZ4EGgF6E6ADAk0I0IHAHQjYgYANEFiAgAUEOIDfBXgOYBvgScA3gd8E+Fr+LcC3Ap8FeAvwLsDbAp8F+FLgfwH+FOBfgB8F+FHADwK8CPCRgA8CPAjwI8CTAE8CNAB0AHAHAg4gYEGAFwh4gIAPEPEAgQ8IsAGBDQhsQIAHCFgA2AewbcA3Ad8E+RLkSwAvAbwEeBPgTYA3Ad4E+BLgSwBvAd4CvAhwI8BHAh4I8CCABwQ8QMAHCDiAgA0I3IGADQjQgMANDLSAgAcI+AAxHyDsA8Q+QNgHxH6AsA8I+4CwDwg7gLAHCBuAsAEIGxCoAYEaEGiBgAYEaIDAAQQeIMABBBzAsAPgDsA3Ad8E+RLgS4AvAb4EeBPgTYA3Ad4E+BLgSwBvAd4CvAhwI8BHAh4I8CCABwQ8QMAHCDiAgA0I3IGADQjQgMANDLSAgAcI+AAxHyDsA8Q+QNgHxH6AsA8I+4CwDwg7gLAHCBuAsAEIGxCoAYEaEGiBgAYEaIDAAQQeIMABBBzA6QDOBHwT8E2ALwG+BHgS4EsALwG8BHhTgDcA7wI8CPAiwIcCHghwIMADBB4g4AECDxDwAAGNCNyAgA0I0IDAjQjQgMANDLSAgAcI+AAxHyDsA8Q+QNgHxH6AsA8I+4Cwjwg7gLAHCBuAsAEIGxCoAYEaEGiBgAYEaIDAAQQeIMABBBzA6QCeCXim+zbgm5FvBr5Z+GbkawGvBF4JuBbgTYA3Ad8IfCfgTcC3Am8F3gq8FbgUcCjgQ4CvBHwI8CGARwQ8QMAHCBiAgAUIDEDAAgQOIGADAm1AcAMCNiBQg+AGBGrAcAeMdsB4B0wfgH4g8AGhHxD5gM4PNPsB5x/Q7APiPyD7A7Y/YPuAzgfEDgRuIHAjwAQC/iDgD5g/QP0HjH/A+AMGO2C0A4Y7YDQDhjNgMwM2M2A1A5YzYDUDBjNgMQOGA/AcgMMAXgRwKcCzAs8KPCvwKOCjwI8CPgrwIsCLABcCuBTgWYBXAd4FeBfgbYHXBdwI0AHQAcAdANgBgA0I2IEADQhcgIANCFyAQAMC/v9VpW1tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra1tv1w/jW/uHlY3Q+gAAAAASUVORK5CYII=';

interface HeaderProps {
  theme: 'light' | 'dark';
  sessionActive: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, sessionActive, onToggleTheme, onToggleSidebar, onToggleSettings }) => {
  const SunIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 24 24" viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5S14.76,7,12,7z M12,15c-1.65,0-3-1.35-3-3s1.35-3,3-3s3,1.35,3,3 S13.65,15,12,15z M12,3c-0.55,0-1,0.45-1,1v2c0,0.55,0.45,1,1,1s1-0.45,1-1V4C13,3.45,12.55,3,12,3z M19.07,4.93 c-0.39-0.39-1.02-0.39-1.41,0l-1.41,1.41c-0.39,0.39-0.39,1.02,0,1.41c0.39,0.39,1.02,0.39,1.41,0l1.41-1.41 C19.46,5.95,19.46,5.32,19.07,4.93z M12,17c-0.55,0-1,0.45-1,1v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2C13,17.45,12.55,17,12,17z M7.76,16.24c-0.39-0.39-1.02-0.39-1.41,0l-1.41,1.41c-0.39,0.39-0.39,1.02,0,1.41c0.39,0.39,1.02,0.39,1.41,0l1.41-1.41 C8.15,17.26,8.15,16.63,7.76,16.24z M20,12h-2c-0.55,0-1,0.45-1,1s0.45,1,1,1h2c0.55,0,1-0.45,1-1S20.55,12,20,12z M6,12H4 c-0.55,0-1,0.45-1,1s0.45,1,1,1h2c0.55,0,1-0.45,1-1S6.55,12,6,12z M4.93,4.93c-0.39-0.39-1.02-0.39-1.41,0C3.13,5.32,3.13,5.95,3.51,6.34 l1.41,1.41C5.32,8.15,5.95,8.15,6.34,7.76C6.73,7.37,6.73,6.74,6.34,6.34L4.93,4.93z M16.24,16.24c-0.39-0.39-1.02-0.39-1.41,0 c-0.39,0.39-0.39,1.02,0,1.41l1.41,1.41c0.39,0.39,1.02,0.39,1.41,0c0.39-0.39,0.39-1.02,0-1.41L16.24,16.24z"/></svg>
  );

  const MoonIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 24 24" viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M12.3,4.9c0.4-0.2,0.6-0.7,0.5-1.1c-0.2-0.4-0.7-0.6-1.1-0.5C9.5,4.1,8,5.4,7.1,7.1C6,9.2,6.2,11.8,7.7,13.7 c1.4,1.8,3.6,2.7,5.8,2.7c0.6,0,1.1,0,1.7-0.1c0.4-0.1,0.7-0.4,0.7-0.8c-0.1-0.4-0.4-0.7-0.8-0.7c-0.5,0.1-1,0.1-1.5,0.1 c-1.8,0-3.5-0.8-4.7-2.3C7.6,11.5,7.5,9.5,8.3,7.8C9,6.5,10.3,5.4,11.7,4.9C11.9,4.9,12.1,4.9,12.3,4.9z M12,2c0.6,0,1-0.4,1-1 s-0.4-1-1-1s-1,0.4-1,1S11.4,2,12,2z M4,12c0,0.6,0.4,1,1,1h2c0.6,0,1-0.4,1-1s-0.4-1-1-1H5C4.4,11,4,11.4,4,12z M20,12 c0,0.6-0.4,1-1,1h-2c-0.6,0-1-0.4-1-1s0.4-1,1-1h2C19.6,11,20,11.4,20,12z M12,20c-0.6,0-1,0.4-1,1s0.4,1,1,1s1-0.4,1-1 S12.6,20,12,20z M3.5,18.5c0.3,0.3,0.8,0.3,1.1,0l1.4-1.4c0.3-0.3,0.3-0.8,0-1.1s-0.8-0.3-1.1,0l-1.4,1.4 C3.2,17.7,3.2,18.2,3.5,18.5z M19.1,5.6l-1.4-1.4c-0.3-0.3-0.8-0.3-1.1,0s-0.3,0.8,0,1.1l1.4,1.4c0.3,0.3,0.8,0.3,1.1,0 C19.4,6.4,19.4,5.9,19.1,5.6z M18,3.5c0-0.3-0.1-0.5-0.3-0.7c-0.2-0.2-0.4-0.3-0.7-0.3c-0.5,0-1,0.4-1,1s0.4,1,1,1 C17.6,4.5,18,4.1,18,3.5z M4.2,6.3c0.2,0.2,0.4,0.3,0.7,0.3s0.5-0.1,0.7-0.3c0.3-0.3,0.3-0.8,0-1.1L4.2,3.8c-0.3-0.3-0.8-0.3-1.1,0 s-0.3,0.8,0,1.1L4.2,6.3z"/></svg>
  );

  const SettingsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>
  );

  return (
    <header className="absolute top-0 left-0 w-full z-50">
      <div className="flex items-center justify-between p-2.5 m-2.5 rounded-xl backdrop-blur-lg bg-light-glass-bg dark:bg-dark-glass-bg border border-light-border dark:border-dark-border transition-colors duration-300">
        <button
          className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          onClick={onToggleSidebar}
          aria-label="Toggle Menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6 fill-current">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full transition-colors ${sessionActive ? 'bg-green-500' : 'bg-gray-400'}`} title={sessionActive ? 'Session Active' : 'Session Inactive'}></div>
          <img src={LOGO_BASE64} alt="Letsbonk.fun Logo" className="h-8 opacity-80" />
        </div>


        <div className="flex items-center space-x-1">
          <button
            className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            onClick={onToggleTheme}
            aria-label="Toggle Theme"
          >
            {theme === 'light' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            onClick={onToggleSettings}
            aria-label="Toggle Settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
