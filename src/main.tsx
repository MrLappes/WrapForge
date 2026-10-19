import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing.');
createRoot(container).render(<App />);
