import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import doctorRoutes from "./routes/doctors.js";
import referralRoutes from "./routes/referrals.js";
import staffRoutes from "./routes/staff.js";
import hospitalRoutes from "./routes/hospitals.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Referral system API running on port ${port}`));
