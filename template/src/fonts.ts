import { loadFont as loadHanken } from '@remotion/google-fonts/HankenGrotesk';
import { loadFont as loadSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

// Same three families the app itself loads.
loadHanken('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] });
loadSerif('normal', { weights: ['400'], subsets: ['latin'] });
loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] });
