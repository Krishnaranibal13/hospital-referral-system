# Hospital Doctor Referral System

Tracks patient referrals from independent doctors, captures the location where
each doctor's QR code was scanned, lets reception match walk-in patients to a
referral, and auto-credits the referring doctor once confirmed.

## How it works

1. **Admin** creates a doctor profile → system generates a unique QR code
   (links to `/refer/{uniqueCode}`) and sets the credit amount for that doctor.
2. **Doctor** hands the QR to a patient, or scans it themselves with the
   patient present. Scanning opens a form to enter the patient's name, age,
   and phone — the browser also asks for location permission, and the
   coordinates + reverse-geocoded address are stored with the referral.
3. **Reception**, when the patient physically arrives, searches by name/phone,
   confirms the match ("Confirm arrival"), and the system automatically
   creates a credit transaction for the referring doctor.
4. **Admin** can see all doctors, referral counts, and total credits owed/paid.

## Stack

- Backend: Node.js, Express, MySQL, Prisma ORM, JWT auth
- Frontend: React + Vite, React Router
- QR generation: `qrcode` npm package (server-side)
- Reverse geocoding: OpenStreetMap Nominatim (free, no API key)

## Local setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL to your MySQL instance, and a random JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run seed        # creates first admin login (admin@hospital.com / ChangeMe123!)
npm run dev          # starts API on http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev          # starts on http://localhost:5173
```

Log in at `http://localhost:5173/login` with the seeded admin account, add a
doctor, and you'll get a downloadable QR code. Scanning it (or opening the
`/refer/{code}` link) shows the public patient form.

## Creating a reception account

There's no self-signup for staff by design. Use Prisma Studio (`npm run
prisma:studio` in `backend/`) or a short script to insert a `StaffUser` row
with `role: "RECEPTION"` — hash the password with bcrypt first, e.g.:

```js
import bcrypt from "bcryptjs";
console.log(await bcrypt.hash("yourpassword", 10));
```

## Deployment

- **Backend**: any Node host with a MySQL add-on — Railway, Render (via
  PlanetScale/external MySQL), or a VPS work well. Set the environment
  variables from `.env.example`, run `npx prisma migrate deploy` on first
  deploy, then `npm start`.
- **Frontend**: Vercel, Netlify, or Render static site. Set `VITE_API_URL`
  to your deployed backend's `/api` URL, and set the backend's
  `FRONTEND_URL` / `ALLOWED_ORIGINS` to match your deployed frontend domain
  (QR codes are generated using `FRONTEND_URL`, so set it *before* creating
  doctors).
- Use HTTPS in production — geolocation only works on secure origins in most
  browsers anyway.

## Notes on data privacy

This system stores patient name, age, phone number, and precise GPS location —
all sensitive personal data. Before going live:
- Restrict admin/reception accounts to staff who need them; rotate passwords.
- Consider India's Digital Personal Data Protection (DPDP) Act obligations:
  you'll want a consent notice on the public referral form, a data retention
  policy, and a way to delete a patient's record on request.
- Put the backend behind HTTPS everywhere, including local testing if you can.
- The doctor's `uniqueCode` acts as a bearer credential — anyone with the QR
  image can submit referrals under that doctor's name. That's expected here,
  but keep it in mind for abuse handling (the public endpoint is rate
  limited to 20 submissions per 15 minutes per IP already).

## Extending this

Straightforward next additions if you need them:
- SMS/WhatsApp notification to reception when a new referral comes in
- Doctor-facing portal to see their own referral/credit history
- CSV export of credits for accounting/payout
- Map view of scan locations per doctor (useful for verifying referral areas)
# webhook test
