import assert from "node:assert/strict";
import test from "node:test";
import { activeAdminGroup, adminNavigation, isAdminDestinationActive } from "../lib/admin-navigation.ts";

test("canonical admin navigation retains every former destination", () => {
  const destinations = adminNavigation.flatMap((group) => group.items.map((item) => item.href));
  assert.deepEqual(destinations, [
    "/admin", "/admin/availability", "/admin/pricing", "/admin/events", "/admin/bookings",
    "/admin/store", "/admin/members", "/admin/inner-sanctum", "/admin/collections",
    "/admin/benefits", "/admin/tasks", "/admin/referrals",
  ]);
});

test("nested routes activate their owning navigation destination", () => {
  assert.equal(isAdminDestinationActive("/admin/bookings/booking-id", "/admin/bookings"), true);
  assert.equal(isAdminDestinationActive("/admin/store/products/product-id", "/admin/store"), true);
  assert.equal(isAdminDestinationActive("/admin/enquiries/enquiry-id", "/admin"), true);
  assert.equal(isAdminDestinationActive("/admin/availability", "/admin"), false);
});

test("active route resolves its navigation group", () => {
  assert.equal(activeAdminGroup("/admin/store/orders/order-id"), "Commerce");
  assert.equal(activeAdminGroup("/admin/tasks/task-id"), "Community");
  assert.equal(activeAdminGroup("/admin/enquiries/enquiry-id"), "Retreat");
});
