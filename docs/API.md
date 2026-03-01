# MemoryVault API Details

## API Versioning
- Primary base path: `/api/v1`
- Legacy compatibility alias: `/api` (internally routed to v1)

## Authentication
### Register
- `POST /api/v1/auth/register`

### Login
- `POST /api/v1/auth/login`

### Verify Email
- `GET /api/v1/auth/verify-email?token=<token>`
- `POST /api/v1/auth/verify-email`

### Password Reset
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`

## Tree Privacy and Access
- Privacy modes: `public`, `private`
- Private reads require `x-tree-password` unless requester is owner/admin.
- Private reads can use short-lived `x-tree-access-token` once issued after password verification.

## Family Trees
### Main Tree APIs
- `GET /api/v1/trees`
- `POST /api/v1/trees`
- `GET /api/v1/trees/:treeId`
- `PUT /api/v1/trees/:treeId`
- `DELETE /api/v1/trees/:treeId`

### Compatibility Tree APIs
- `POST /api/v1/tree/create`
- `GET /api/v1/tree/my-trees`
- `PUT /api/v1/tree/update/:id`
- `DELETE /api/v1/tree/delete/:id`
- `GET /api/v1/tree/:treeId/focus/:memberId`

### Backup APIs
- `GET /api/v1/tree/:id/export-full` (owner-protected)
- `POST /api/v1/tree/import` (transaction-safe import with reference validation)

## Members
### Main Member APIs
- `GET /api/v1/trees/:treeId/members`
- `POST /api/v1/trees/:treeId/members`
- `GET /api/v1/trees/:treeId/members/:memberId`
- `PUT /api/v1/trees/:treeId/members/:memberId`
- `DELETE /api/v1/trees/:treeId/members/:memberId?subtree=true|false`
- `GET /api/v1/trees/:treeId/members/:memberId/relations`
- `PATCH /api/v1/trees/:treeId/members/:memberId/relations`
- `GET /api/v1/trees/:treeId/members/:memberId/graph?depth=2&limit=250`

### Compatibility Member APIs
- `POST /api/v1/member/add`
- `PUT /api/v1/member/update/:id`
- `DELETE /api/v1/member/delete/:id`
- `GET /api/v1/member/:id`

## Public Sharing
- `GET /api/v1/public/tree/:slug`
- Access allowed when tree is public or valid private tree password is provided.

## SaaS: Plans and Subscriptions
### Plan APIs (admin)
- `POST /api/v1/admin/plan/create`
- `GET /api/v1/admin/plan/all`
- `PUT /api/v1/admin/plan/update/:id`
- `DELETE /api/v1/admin/plan/delete/:id`

### Subscription APIs (authenticated)
- `GET /api/v1/subscription/plans`
- `POST /api/v1/subscription/subscribe` (manual activation blocked; returns 403)
- `GET /api/v1/subscription/my`
- `POST /api/v1/subscription/cancel`

### Plan Limit Enforcement
- Tree create checks `maxTrees`.
- Member add checks `maxMembers`.
- Limit exceed responses return HTTP `403` with upgrade message.

## Payments (Razorpay)
### Create Order
- `POST /api/v1/payment/create-order`
- Creates a Razorpay order for paid plans only.

### Verify Payment
- `POST /api/v1/payment/verify`
- Verifies HMAC signature using `RAZORPAY_KEY_SECRET`.
- Activates subscription only after successful verification.
- Duplicate payment activation is blocked via payment reference checks.

## Notifications
- `GET /api/v1/notifications?page=1&limit=20`
- `PUT /api/v1/notifications/read/:id`

Notification triggers:
- Subscription activated
- Plan expiring in 7 days
- Tree shared publicly
- Member added

## Admin APIs
- `GET /api/v1/admin/all-trees`
- `DELETE /api/v1/admin/delete-tree/:id`
- `GET /api/v1/admin/all-users`
- `GET /api/v1/admin/integrity-check`
- `GET /api/v1/admin/audit-logs?page=1&limit=20`

Integrity checker detects:
- broken references
- circular spouse loops
- duplicate relationship entries

Audit logs track:
- tree creation
- member addition
- member deletion
- plan purchase
- subscription cancellation

## Security Notes
- JWT auth + role checks (`user`, `admin`)
- CSRF protection for unsafe methods (`x-csrf-token`)
- Request sanitization + NoSQL-injection guards
- Upload hardening for images
- Rate limiting for API + auth routes
