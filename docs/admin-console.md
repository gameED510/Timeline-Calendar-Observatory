# Read-only Admin Console

Entry: sign in to TL, then open More Tools > Management Console.

The first owner is the existing confirmed account `ly1636824020@gmail.com`.
The migration binds its UUID in `public.tl_admin_allowlist`. Email matching only
occurs during migration bootstrap; runtime authorization uses `auth.uid()`.
Ordinary users cannot read or write the allowlist. No service-role key is used
in the browser or added to the hosting environment.

The `admin_user_overview` RPC returns only:

- User UUID and registration email.
- Registration time, last sign-in time, and email confirmation status.
- Non-deleted cloud project count, completed scheduled node count, and latest
  cloud project write time.
- Total registrations, registrations in the last 7 days, and sign-ins in the
  last 30 days.

Sign-in counts are not page-view analytics. Completed node counts include only
completion flags that also have a corresponding milestone date. Local edits
that have not synced are not counted. Last cloud write includes deletion writes.
No project names, project documents, quotations, settlements, passwords, or
session credentials are returned. There are no user-management write actions.

Access denied and transport failures clear the displayed results. Closing the
panel or changing the signed-in account discards the results. Nothing is stored
in browser local storage by the admin module. Search uses literal email
substring matching, with server-bounded input and 25-row client pagination.

Future administrator additions must be deliberate database changes by the
project owner. This release intentionally has no administrator-management UI.
