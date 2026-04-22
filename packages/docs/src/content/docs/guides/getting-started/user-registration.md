---
title: User Registration
description: How users register themselves and how administrators approve accounts
---

After initial setup, SampleDB allows users to register themselves. New accounts require administrator approval before users can sign in. This workflow ensures that only authorized personnel gain access to your laboratory's sample management system.

## Self-Registration Flow

1. Navigate to the sign-in page and click **Create account**.
2. Enter your email, name, password (at least 8 characters), and confirm your password.
3. Click **Create account**.
4. You will see a confirmation message: "An administrator will approve your account before you can sign in."
5. Wait for an administrator to approve your account.
6. Once approved, sign in with your email and password as usual.

## Approving User Accounts (Administrators)

Administrators approve new user accounts from the User Management page:

1. Sign in as an administrator.
2. Go to **Admin** → **User Management** (or navigate to `/admin/users`).
3. Users with **Pending** status are awaiting approval.
4. Click the green checkmark (approve) button next to the user's name to approve their account.
5. The user can now sign in with their registered email and password.

Pending users are marked with an amber "Pending" badge in the Name column and show "Pending" in the Status column. Approved users show "Approved" in green.

## Admin-Created Users

Administrators can also create user accounts directly from the User Management page using **Add User**. Accounts created this way are approved immediately and do not require the approval step. This is useful when onboarding team members who already have authorization to use the system.

## Troubleshooting

### "Your account is pending approval"

If you see this message when trying to sign in, your registration was successful but an administrator has not yet approved your account. Contact your SampleDB administrator to request approval.

### "Email already in use"

This means another user (including a pending user) has already registered with that email address. Use a different email or contact your administrator if you believe this is an error.
