# Secure Chat

## Trinetra AI Protection

Protection is disabled for each account until its owner enables it in the chat sidebar and completes Trinetra's consent flow. Secure Chat binds the one-time OAuth state to the authenticated user, exchanges the code on the server, and stores the short-lived account token encrypted with AES-256-GCM. Turning protection off immediately clears the local token and pending state. Only text, URL, and UPI/payment message content is sent; attachment and voice messages continue through Secure Chat without Trinetra analysis.

Configure these server-side variables in local `.env.local` and the Vercel project settings. Do not prefix any of them with `NEXT_PUBLIC_`:

| Variable | Purpose |
| --- | --- |
| `TRINETRA_BASE_URL` | `https://trinetra-ai-ua5e.onrender.com` |
| `TRINETRA_SECURE_CHAT_API_KEY` | Server-to-server integration key issued by Trinetra |
| `TRINETRA_REDIRECT_URI` | `https://<Secure Chat domain>/api/integrations/trinetra/callback` |
| `TRINETRA_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte key (or 64 hex characters) for token encryption at rest |
| `TRINETRA_TIMEOUT_MS` | Optional provider timeout in milliseconds; defaults to `90000` to allow for Render cold starts |

For local development, set the redirect URI to `http://localhost:3000/api/integrations/trinetra/callback` and register that exact URI with Trinetra. After deploying the schema changes, run `pnpm db:push` with the unpooled database URL configured. Suspicious and scam messages arrive locked for the receiver; opening one is saved so it stays open after refresh. Provider outages and invalid responses never block message delivery; the affected message displays a small unavailable status instead of a fabricated result.

## Folder Structure

```text
secure-chat/
|-- .env.local.example
|-- .gitignore
|-- .qoder/
|   `-- repowiki/
|       `-- en/
|           |-- meta/
|           |   `-- repowiki-metadata.json
|           `-- content/
|               |-- API Reference/
|               |   |-- API Reference.md
|               |   |-- Conversation Management API.md
|               |   |-- Conversations API.md
|               |   |-- Messages API.md
|               |   |-- Presence API.md
|               |   `-- Users API.md
|               |-- Authentication System/
|               |   |-- Authentication System.md
|               |   |-- Route Protection.md
|               |   |-- Security Implementation.md
|               |   |-- Session Management.md
|               |   |-- User Login.md
|               |   `-- User Registration.md
|               |-- Configuration & Customization.md
|               |-- Database Schema & Data Models.md
|               |-- Deployment & Production.md
|               |-- Frontend Components/
|               |   |-- Chat Area Component.md
|               |   |-- Chat Dashboard Component.md
|               |   |-- Conversation List Component.md
|               |   |-- Frontend Components.md
|               |   |-- Message Input Component.md
|               |   |-- Message List Component.md
|               |   |-- Sidebar Component.md
|               |   `-- UI Components Library.md
|               |-- Getting Started.md
|               |-- Project Overview.md
|               |-- Real-Time Messaging System/
|               |   |-- Channel Subscription and Management.md
|               |   |-- Client-Side Integration/
|               |   |   |-- Client-Side Integration.md
|               |   |   |-- Component Integration Patterns.md
|               |   |   `-- React Hooks Implementation.md
|               |   |-- Event Broadcasting and Handling/
|               |   |   |-- Event Broadcasting and Handling.md
|               |   |   |-- Message Events.md
|               |   |   `-- Presence and Typing Events.md
|               |   |-- Real-Time Messaging System.md
|               |   `-- WebSocket Connection Management.md
|               |-- Services Layer Architecture/
|               |   |-- Conversation Service.md
|               |   |-- Message Service.md
|               |   |-- Service Patterns & Best Practices.md
|               |   |-- Services Layer Architecture.md
|               |   `-- User Service.md
|               `-- Troubleshooting & Debugging.md
|-- .vscode/
|   `-- settings.json
|-- app/
|   |-- globals.css
|   |-- layout.tsx
|   |-- page.tsx
|   |-- (auth)/
|   |   |-- layout.tsx
|   |   |-- login/
|   |   |   `-- page.tsx
|   |   `-- register/
|   |       `-- page.tsx
|   |-- (chat)/
|   |   |-- layout.tsx
|   |   `-- chat/
|   |       `-- page.tsx
|   `-- api/
|       |-- auth/
|       |   `-- [...all]/
|       |       `-- route.ts
|       |-- conversations/
|       |   |-- route.ts
|       |   `-- [id]/
|       |       |-- messages/
|       |       |   `-- route.ts
|       |       |-- read/
|       |       |   `-- route.ts
|       |       `-- typing/
|       |           `-- route.ts
|       |-- files/
|       |   `-- [filename]/
|       |       `-- route.ts
|       |-- messages/
|       |   `-- route.ts
|       |-- presence/
|       |   `-- route.ts
|       |-- pusher/
|       |   `-- auth/
|       |       `-- route.ts
|       |-- upload/
|       |   `-- route.ts
|       `-- users/
|           `-- route.ts
|-- components/
|   |-- auth/
|   |   |-- LoginForm.tsx
|   |   `-- RegisterForm.tsx
|   |-- chat/
|   |   |-- ChatArea.tsx
|   |   |-- ChatDashboard.tsx
|   |   |   |-- Users API.md
|   |   |-- ConversationList.tsx
|   |   |-- EmptyState.tsx
|   |   |-- MessageBubble.tsx
|   |   |-- MessageInput.tsx
|   |   |-- MessageList.tsx
|   |   |-- ProfileModal.tsx
|   |   |-- Sidebar.tsx
|   |   |-- UserAvatar.tsx
|   |   `-- UserSearchModal.tsx
|   `-- ui/
|       `-- button.tsx
|-- drizzle.config.ts
|-- hooks/
|   `-- useRealtime.ts
|-- lib/
|   |-- auth-client.ts
|   |-- auth-utils.ts
|   |-- auth.ts
|   |-- db/
|   |   |-- index.ts
|   |   `-- schema.ts
|   |-- realtime/
|   |   |-- channels.ts
|   |   |-- client.ts
|   |   `-- index.ts
|   |-- services/
|   |   |-- conversation.service.ts
|   |   |-- message.service.ts
|   |   |-- trinetra.service.ts
|   |   `-- user.service.ts
|   |-- utils.ts
|   `-- validations/
|       |-- auth.ts
|       `-- message.ts
|-- middleware.ts
|-- next-env.d.ts
|-- next.config.mjs
|-- package-lock.json
|-- package.json
|-- pnpm-lock.yaml
|-- pnpm-workspace.yaml
|-- postcss.config.mjs
|-- public/
|   |-- apple-icon.png
|   |-- icon-dark-32x32.png
|   |-- icon-light-32x32.png
|   |-- icon.svg
|   |-- placeholder.jpg
|   |-- placeholder.svg
|   |-- placeholder-logo.png
|   |-- placeholder-logo.svg
|   `-- placeholder-user.jpg
|-- README.md
|-- tsconfig.json
|-- tsconfig.tsbuildinfo
`-- types/
    `-- index.ts
```
