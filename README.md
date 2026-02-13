# Zion's Hymns - Song Leader Trainer

A web app for practicing a cappella song leading with real-time pitch detection and feedback.

## Features

- **Real-time pitch detection** using YIN algorithm via AudioWorklet
- **Visual pitch display** with 60fps Canvas rendering
- **Practice modes**: Real hymns and auto-generated exercises
- **Grading system**: Pitch accuracy, rhythm, and stability scoring
- **PWA support**: Installable on mobile devices

## Tech Stack

- **Frontend**: React 18, Vite 6
- **Audio**: Web Audio API, AudioWorklet
- **Pitch Detection**: YIN algorithm with parabolic interpolation
- **Visualization**: Canvas API (bypasses React for performance)

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── App.jsx                 # Main application
├── main.jsx                # Entry point
├── audio/
│   ├── pitch-engine.js     # Main thread pitch controller
│   └── grader.js           # Performance scoring
└── components/
    └── PitchVisualizer.jsx # Canvas-based pitch display

public/
├── pitch-processor.js      # AudioWorklet (runs on audio thread)
├── hymn_index.json         # Hymn metadata
├── hymn_melodies/          # Encoded melody data (JSON)
├── hymn_images/            # Sheet music images
└── manifest.json           # PWA manifest
```

## How It Works

1. **Audio capture**: Microphone input via `getUserMedia`
2. **Pitch detection**: AudioWorklet processes audio on dedicated thread using YIN algorithm
3. **Smoothing**: Outlier rejection, median filter, and EMA for stable pitch display
4. **Grading**: Compares detected pitches against reference melody data

## Browser Support

- Chrome/Edge (recommended)
- Safari (iOS 14.5+)
- Firefox

Requires microphone permission.

## License

Private project.
