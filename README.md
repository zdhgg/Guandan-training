# Guandan Training Backend

A Node.js + TypeScript backend API for Guandan training platform.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env file with your configuration
```

### Development

```bash
# Run in development mode with hot reload
npm run dev

# Or run with ts-node directly
npm run dev:ts
```

### Production

```bash
# Build the project
npm run build

# Start the production server
npm start
```

## 📁 Project Structure

```
guandan-training/
├── src/
│   └── app.ts          # Main application entry point
├── dist/               # Compiled JavaScript (generated)
├── .env.example        # Environment variables template
├── .gitignore          # Git ignore file
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## 🔧 Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start the production server
- `npm run dev` - Start development server with nodemon
- `npm run dev:ts` - Start development server with ts-node
- `npm run clean` - Clean build artifacts
- `npm run tsc` - Run TypeScript compiler

## 🛠️ Technologies

- **Node.js** - JavaScript runtime
- **TypeScript** - Type-safe JavaScript
- **Express** - Web framework
- **dotenv** - Environment variable management

## 📝 Environment Variables

Create a `.env` file based on `.env.example`:

```bash
PORT=3000
NODE_ENV=development
```

## 📡 API Endpoints

- `GET /` - Welcome message
- `GET /health` - Health check endpoint

## 📄 License

ISC