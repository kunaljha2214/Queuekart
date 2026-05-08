# QueueKart

Queue management for shops and customers: **Node.js API** (`server/`) and **React Native** app (`mobile/`).

## Quick start

- **API:** Copy `server/.env.example` to `server/.env`, set `MONGODB_URI` and `JWT_SECRET`, then `cd server && npm install && npm run dev`.
- **Mobile:** `cd mobile && npm install`. For Android physical devices, use `adb reverse tcp:5000 tcp:5000` when the API runs on your PC. Configure `mobile/src/config/api.js` if needed.

## License

Private / your choice — add a `LICENSE` file if you open-source the project.
