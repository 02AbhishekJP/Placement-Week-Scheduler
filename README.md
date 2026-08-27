# 🎓 Placement Week Scheduler

The **Placement Week Scheduler** is a high-performance, full-stack web application designed to handle the massive logistical complexities of university placement drives. It features an AI-powered scheduling engine, a real-time Command Center dashboard, and an advanced minimal-churn replanning system to seamlessly resolve live, compound disruptions.

---

## ✨ Features & Functionalities

### 1. Robust Dataset Generation
- **Custom Scenarios:** Generate realistic datasets with configurable parameters for the number of students, companies, rooms, and days.
- **Deterministic Simulation:** Uses a fixed random seed to ensure predictable and reproducible scheduling results for demonstrations and testing.

### 2. High-Performance Scheduling Engine
- **Greedy Hard-Constraint Algorithm:** Instantly processes thousands of constraints to assign interview slots.
- **Rules Enforced:** 
  - Prevents double-booking for any student, panel, or room.
  - Strict adherence to company CGPA cutoffs.
  - Organizes interviews based on Priority Tiers (Mass, Mid, Niche).

### 3. Command Center Dashboard
- **Live Timeline Grid:** A comprehensive, color-coded visual schedule segmented by days and rooms.
- **Real-Time KPIs:** Tracks metrics such as total scheduled students, unscheduled students, daily room utilization, and system health.
- **Company Operations Tracking:** Visual progress bars indicating completion percentage for each company's interview quota.

### 4. ⚡ Disruption Center & Replanning
Real-world placement drives are chaotic. The Disruption Center simulates and intelligently resolves real-world issues:
- **Compound Disruptions:** Queue multiple disruptions at once (e.g., *Company A is late* AND *Room 4 is offline*).
- **Minimal-Churn Replanner:** Instead of regenerating the schedule from scratch, the system surgically localizes the impact, minimizing reshuffling for both students and recruiters.
- **Handled Scenarios:**
  - `COMPANY_LATE`: Shifts the company's entire schedule forward.
  - `STUDENT_WITHDRAWN`: Frees up slots and promotes waitlisted students.
  - `PANEL_DROPPED`: Reduces parallel interview capacity.
  - `ROOM_UNAVAILABLE`: Evicts existing interviews and reallocates them.
  - `NEW_COMPANY`: Dynamically injects a surprise recruiter into the active schedule.

### 5. Replan Diff & Analytics
- **Actionable Diffs:** After a replan, the UI provides a clear diff showing exactly which slots were canceled, shifted, or newly assigned.
- **AI Explanations:** Transparently displays the logical rules behind the scheduling engine's choices.

---

## 📸 System Demonstration

*(See the `docs/demo.webp` file for a full animated demonstration of the Command Center and Replanner in action!)*

![System Demonstration](docs/demo.webp)

---

## 🛠️ Tech Stack

- **Frontend:** React, Vite, Vanilla CSS (Glassmorphic Design)
- **Backend:** Node.js, Express
- **Database:** Prisma ORM, SQLite
- **Tooling:** Concurrently (for running client & server together)

---

## 📂 File Structure

```text
Mirai labs software development/
│
├── client/                     # React Frontend Application
│   ├── public/                 # Static assets
│   ├── src/
│   │   ├── api.js              # REST API client
│   │   ├── App.jsx             # Main Dashboard UI
│   │   ├── main.jsx            # React Entry Point
│   │   ├── components/         # Reusable UI Components
│   │   │   ├── DisruptionPanel.jsx  # Disruption Center UI
│   │   │   ├── ReplanDiffView.jsx   # Post-replan diffs
│   │   │   ├── TimelineGrid.jsx     # Visual schedule grid
│   │   │   └── UnscheduledList.jsx  # Unassigned student list
│   │   └── styles/             # Global CSS and Variables
│   ├── package.json
│   └── vite.config.js          # Vite configuration
│
├── server/                     # Node.js & Express Backend
│   ├── prisma/
│   │   ├── schema.prisma       # Database Schema Models
│   │   └── dev.db              # SQLite Database
│   ├── src/
│   │   ├── index.js            # Express server & API routes
│   │   ├── db.js               # Prisma client initialization
│   │   ├── generator.js        # Dataset generation logic
│   │   ├── scheduler.js        # Hard-constraint scheduling engine
│   │   └── replanner.js        # Minimal-churn disruption logic
│   └── package.json
│
├── docs/                       # Documentation assets
│   └── demo.webp               # Video demonstration recording
│
├── package.json                # Root workspace configuration
└── README.md                   # This file
```

---

## 🚀 Setup & Installation

Follow these steps to run the project locally.

### 1. Install Dependencies
Install dependencies for both the root workspace, the client, and the server.
```bash
npm install
cd server && npm install
cd ../client && npm install
```

### 2. Database Setup
Initialize the SQLite database and generate the Prisma client.
```bash
cd server
npx prisma db push
npx prisma generate
```

### 3. Run the Application
Start both the React frontend and the Express backend simultaneously from the root directory.
```bash
npm run dev
```
- **Client:** Runs on `http://localhost:5173`
- **Server:** Runs on `http://localhost:3001` (Proxy configured in Vite)
