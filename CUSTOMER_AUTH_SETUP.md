# Customer Authentication Setup

The customer authentication code is already included in this project. Complete
these Supabase steps before testing it.

## 1. Run the database migration

1. Open the Supabase project.
2. Go to **SQL Editor**.
3. Open `supabase/customer-auth-system.sql` from this project.
4. Copy the whole file into a new Supabase query.
5. Click **Run**.

The migration:

- secures new sign-ups as `customer`;
- creates `saved_addresses`;
- adds customer RLS policies;
- indexes customer orders;
- preserves the existing `customer_user_id` column when it already exists.

## 2. Configure the confirmation URL

In Supabase, open **Authentication → URL Configuration**.

- For local testing, add `http://localhost:3000/customer/login`.
- For production, add
  `https://YOUR-DOMAIN/customer/login`.

Keep the deployed website URL as the Site URL.

## 3. Test the complete flow

1. Start the app with `npm run dev`.
2. Open `/customer/signup`.
3. Create a new customer account.
4. Confirm the email when email confirmation is enabled.
5. Log in at `/customer/login`.
6. Add an address at `/customer/addresses`.
7. Create a delivery at `/book`.
8. Confirm the new order appears at `/customer/dashboard`.
9. In Supabase Table Editor, check that the order's `customer_user_id`
   matches the signed-in customer's profile ID.

## 4. Test the ban system

1. Open `profiles` in Supabase Table Editor.
2. Find the test customer's row.
3. Change `is_active` from `true` to `false`.
4. Refresh `/customer/dashboard`.
5. The customer must be redirected to the customer login page.
6. Logging in again must show that the account is inactive.

Set `is_active` back to `true` after the test.
