# AUDITFLOW 🛡️

**Audit-Ready Document Approval Workflow Engine** with cryptographically chained audit logging, digital HMAC signatures, and database-level immutability enforcement.

---

## 🌟 Key Architecture & Security Features

1. **Finite State Machine (FSM):** Strict transition validation (`DRAFT` &rarr; `IN_REVIEW` &rarr; `APPROVED` | `REJECTED`). Terminal states cannot be altered.
2. **Server-Side Cryptographic Digest:** Document SHA-256 hashes are computed directly on the backend from uploaded file bytes (client-provided hashes are never trusted).
3. **Cryptographic HMAC Signatures:** Every step decision (Approve/Reject) generates an HMAC-SHA256 signature calculated over `instance_id|document_sha256|actor_id|decision|timestamp`.
4. **Append-Only Cryptographically Chained Ledger:** Each system event appends to `AuditLogLedger`. Hashes chain against preceding entry digests using canonical JSON formatting (`sort_keys=True`, compact separators).
5. **Two-Layer Immutability Enforcement:**
   - **ORM Layer:** Custom QuerySet and Model methods prevent `.update()`, `.delete()`, `.bulk_update()`, and `.save()`, raising `ImmutableError`.
   - **PostgreSQL Database Engine Layer:** PL/pgSQL function and triggers reject `UPDATE`, `DELETE`, and `TRUNCATE` operations directly at the database engine level.
6. **Dual Storage & Engine Fallback:**
   - Local development uses SQLite fallback with local media file storage.
   - Production connects to PostgreSQL (e.g. Supabase Session Pooler with SSL) and Supabase Storage.

---

## 🚀 Quick Start (Windows & PowerShell)

### Prerequisites
- Python 3.10+
- Node.js 18+ (with `npm.cmd`)
- PowerShell

---

### 1. Backend Setup

Open a PowerShell terminal in the repository root (`C:\Users\kaart\OneDrive\Desktop\AuditFlow`):

```powershell
# 1. Create Python virtual environment inside backend/venv
python -m venv backend\venv

# 2. Activate virtual environment
.\backend\venv\Scripts\Activate.ps1

# 3. Install required backend packages
pip install -r backend\requirements.txt

# 4. Initialize environment configuration
# Copy the example file to create backend/.env
Copy-Item backend\.env.example backend\.env
```

> **Note on PowerShell Execution Policies:** If PowerShell restricts script activation (`Activate.ps1`), run scripts directly with `.\backend\venv\Scripts\python.exe`.

#### Run Migrations & Seed Demo Data
```powershell
# Run database migrations (creates SQLite tables and applies trigger migration)
.\backend\venv\Scripts\python.exe backend\manage.py migrate

# Seed demo users and multi-step sample workflow
.\backend\venv\Scripts\python.exe backend\manage.py seed_demo
```

#### Run Automated Test Suite
```powershell
# Run all 10 automated unit & security tests
.\backend\venv\Scripts\python.exe backend\manage.py test workflow
```

#### Start Django Development Server (Port 8000)
```powershell
# Starts REST API at http://localhost:8000/
.\backend\venv\Scripts\python.exe backend\manage.py runserver 8000
```

---

### 2. Frontend Setup (React + Vite)

Open a **second** PowerShell terminal in the repository root:

```powershell
# 1. Navigate into frontend directory
cd frontend

# 2. Install dependencies
npm.cmd install

# 3. Create frontend environment configuration
Copy-Item .env.example .env

# 4. Start Vite development server (Port 5173)
npm.cmd run dev
```

Visit **http://localhost:5173** in your web browser.

---

### 3. Production Frontend Build
```powershell
cd frontend
npm.cmd run build
```

---

## 👥 Demo Accounts & Pre-Configured Workflow

The `seed_demo` command automatically configures the following demo credentials:

| Username | Password | Role | Description |
|:---|:---|:---|:---|
| **`admin`** | `admin123` | Staff Administrator | Can create workflow definitions, review all documents |
| **`alice`** | `demo12345` | Standard User | Approver for Step 1 (*Department Review*) |
| **`bob`** | `demo12345` | Standard User | Approver for Step 2 (*Finance Review*) |
| **`carol`** | `demo12345` | Standard User | Approver for Step 3 (*Executive Sign-Off*) |

### Pre-configured Workflow: **"Purchase Order Approval"**
- **Step 1:** Department Review &rarr; Assigned to **`alice`**
- **Step 2:** Finance Review &rarr; Assigned to **`bob`**
- **Step 3:** Executive Sign-Off &rarr; Assigned to **`carol`**

---

## 🔍 Cryptographic Verification in Action

### Document Integrity Verification
On any document detail view (`/instances/:id`):
- Click **"Verify Integrity"**.
- The backend reads the stored document file, recomputes the SHA-256 digest, and validates it against `instance.document_sha256`.
- Constant-time HMAC checks verify each approver's digital signature against `SIGNING_SECRET`.

### Global Ledger Verification
Visit the **Chain Audit** page (`/audit`):
- Click **"Run Chain Audit Now"**.
- The system traverses all entries from the genesis block (`0000...`) to the head.
- Returns **"Chain Valid"** (Green) or flags **"Tamper Detected at Entry #N"** (Red) if any database row has been altered.

---

## 🐘 Switching to Production PostgreSQL & Supabase

When deploying to Supabase:

1. In Supabase Dashboard, obtain your **Session Pooler connection string** (Port 5432 or 6543) and Service Role API Key.
2. Edit `backend/.env`:
   ```ini
   DB_ENGINE=postgres
   DB_NAME=postgres
   DB_USER=postgres.your-project-ref
   DB_PASSWORD=your-secure-database-password
   DB_HOST=aws-0-region.pooler.supabase.com
   DB_PORT=5432
   DB_SSLMODE=require

   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   SUPABASE_STORAGE_BUCKET=auditflow-documents

   # Ensure you generate secure random production secrets:
   DJANGO_SECRET_KEY=your-high-entropy-django-secret
   SIGNING_SECRET=your-high-entropy-hmac-signing-secret
   ```
3. Run migrations against PostgreSQL:
   ```powershell
   .\backend\venv\Scripts\python.exe backend\manage.py migrate
   ```
   *Migration `0002_audit_ledger_postgres_triggers.py` will automatically detect PostgreSQL and install the PL/pgSQL row-level triggers to enforce physical immutability.*

---

## 📂 Project Structure

```
AUDITFLOW/
├── .gitignore                          # Root ignore rules (.env, venv, node_modules, etc.)
├── README.md                           # Documentation and run instructions
├── backend/
│   ├── .env.example                    # Template environment variables
│   ├── .gitignore                      # Backend-specific ignore rules
│   ├── manage.py                       # Django administrative CLI
│   ├── requirements.txt                # Python package dependencies
│   ├── auditflow_backend/
│   │   ├── __init__.py
│   │   ├── asgi.py
│   │   ├── settings.py                 # Explicit .env loader, DRF, DB engine fallback
│   │   ├── urls.py                     # Root routing
│   │   └── wsgi.py
│   └── workflow/
│       ├── admin.py                    # Read-only admin registration for AuditLogLedger
│       ├── apps.py
│       ├── exceptions.py               # ImmutableError and DRF exception handler
│       ├── ledger.py                   # Canonical SHA-256 chained hashing & verification
│       ├── models.py                   # Definitions, Steps, Instances, Assignments, Ledger
│       ├── serializers.py              # DRF serialization
│       ├── services.py                 # FSM engine, atomic submit/decide, HMAC signing
│       ├── tests.py                    # 10 comprehensive security and workflow tests
│       ├── urls.py                     # API routing endpoints
│       ├── views.py                    # REST ViewSets & custom actions
│       ├── management/commands/
│       │   └── seed_demo.py            # Development demo seeder
│       └── migrations/
│           ├── 0001_initial.py         # Table schema
│           └── 0002_audit_ledger_postgres_triggers.py # PostgreSQL PL/pgSQL triggers
└── frontend/
    ├── .env.example                    # Frontend environment template
    ├── index.html                      # HTML entrypoint
    ├── package.json                    # Vite + React dependencies
    ├── vite.config.js                  # Vite configuration
    └── src/
        ├── App.jsx                     # Application routing & layout
        ├── api.js                      # Axios instance with auth interceptors
        ├── index.css                   # Custom enterprise CSS styling
        ├── main.jsx                    # React root render
        ├── components/
        │   ├── Navbar.jsx              # Navigation header with user info
        │   └── ProtectedRoute.jsx      # Route guard redirecting to /login
        ├── context/
        │   └── AuthContext.jsx         # User auth & token management
        └── pages/
            ├── AuditVerification.jsx   # Global ledger verification UI
            ├── Dashboard.jsx           # Status cards, pending approvals, recent docs
            ├── DefinitionCreate.jsx    # Step builder with approver assignment (Staff)
            ├── DefinitionsList.jsx     # View active approval workflows
            ├── InstanceCreate.jsx      # Document submission & server-side hashing
            ├── InstanceDetail.jsx      # Timeline, HMAC signature, decision & ledger
            ├── InstancesList.jsx       # Document list with status filtering
            ├── Login.jsx               # Sign in with quick-fill demo buttons
            └── Register.jsx            # User registration
```
