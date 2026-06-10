# Gateway - MERN Stack Application

A full-stack IoT Gateway configuration application built with the MERN stack (MongoDB, Express, React, Node.js).

## Project Structure

```
Gateway/
├── backend/          # Express.js API server
│   ├── config/       # Database configuration
│   ├── controllers/  # Route controllers
│   ├── lib/          # MQTT client and utilities
│   ├── middleware/   # Express middleware
│   ├── models/       # Mongoose models
│   ├── routes/       # API routes
│   ├── server.js     # Entry point
│   └── package.json
│
└── frontend/         # React + Vite frontend
    ├── api/          # Hono + tRPC API (for Vite dev server)
    ├── components/   # React components
    ├── contracts/    # Shared types/errors
    ├── src/          # React application source
    │   ├── components/
    │   ├── hooks/
    │   ├── lib/
    │   ├── pages/
    │   ├── providers/
    │   ├── App.jsx
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## Backend Setup

The backend is an Express.js server with MongoDB and MQTT support.

### Installation

```bash
cd backend
npm install
```

### Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/gateway
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
```

### Running the Backend

```bash
# Development
npm run dev

# Production
npm start
```

## Frontend Setup

The frontend is a React application built with Vite, using tRPC for type-safe API calls.

### Installation

```bash
cd frontend
npm install
```

### Environment Variables

Create a `.env` file in the frontend directory:

```env
VITE_API_URL=http://localhost:3000
```

### Running the Frontend

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Features

- **Company Management**: Create, view, and delete companies
- **Gateway Management**: Add IoT gateways to companies with unique prefixes
- **Modbus Configuration**: Configure Modbus parameters for gateways
- **Real-time MQTT**: SSE-based real-time MQTT message streaming
- **WiFi Configuration**: View and manage WiFi settings for gateways

## Tech Stack

### Backend
- Node.js
- Express.js
- MongoDB (Mongoose)
- MQTT (mqtt package)
- CORS

### Frontend
- React 19
- Vite
- tRPC
- TanStack Query
- React Router
- TailwindCSS
- shadcn/ui components
- Lucide icons

## API Endpoints

### Backend (Express)
- `GET /api/ping` - Health check
- `GET /api/companies` - List all companies
- `POST /api/companies` - Create a company
- `GET /api/companies/:id` - Get company details
- `DELETE /api/companies/:id` - Delete a company
- `GET /api/gateways?companyId=:id` - List gateways for a company
- `POST /api/gateways` - Create a gateway
- `GET /api/gateways/:id` - Get gateway details
- `DELETE /api/gateways/:id` - Delete a gateway
- `POST /api/mqtt/publish` - Publish MQTT message
- `GET /api/events?gateway=:prefix` - SSE endpoint for real-time MQTT messages

### Frontend (tRPC - during Vite dev)
- Available at `/api/trpc/*`
- Mirrors the backend API structure

## Development

### Running Both Services

For full development, run both backend and frontend:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:3000` (Vite default) and the backend at `http://localhost:3000` (Express default). You may need to adjust ports to avoid conflicts.

## License

ISC
