import { requireCustomerPage } from "@/lib/customer";

export default async function TrackLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCustomerPage();
  return children;
}
