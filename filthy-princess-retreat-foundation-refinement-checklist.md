# Filthy Princess Retreat --- Foundation Refinement Checklist

## Purpose

This checklist defines the remaining refinement work for the **Filthy
Princess Retreat** foundation.

The core architecture already exists. The goal of these passes is to
refine each workflow individually now that the intended business process
is clear.

The work is divided into three phases:

-   **Phase A --- Repair the Core**
-   **Phase B --- Complete the Customer Journey**
-   **Phase C --- Finish the Foundation**

Once all three phases are complete, the retreat booking, availability,
event, quote, payment, and admin foundation can be considered complete.

------------------------------------------------------------------------

# Phase A --- Repair the Core

## \[ \] Step 1 --- Quote Workflow Repair

**Goal:** Make creating and managing a quote reliable, visible, and easy
to understand.

Creating a quote should no longer produce runtime errors. Once a quote
is successfully created, the enquiry should immediately show the quote
and its guest-facing payment/quote link.

Admin should be able to clearly see whether a quote is:

-   Active
-   Awaiting payment
-   Expired
-   Cancelled
-   Converted into a booking

Creating the quote should continue to create the corresponding inventory
hold automatically.

------------------------------------------------------------------------

## \[ \] Step 2 --- Duration & Date Selection

**Goal:** Make choosing retreat dates simple and consistent throughout
the application.

Introduce standard duration choices:

-   1 Night
-   2 Nights
-   3 Nights
-   5 Nights
-   Custom

Selecting a start date and duration should automatically calculate the
expected end date.

For example:

-   1 Night starting 10 November → ends 11 November
-   2 Nights starting 10 November → ends 12 November
-   5 Nights starting 10 November → ends 15 November

When an end-date picker is opened, it should focus around the
calculated/relevant end date rather than returning to today's date.

The same duration/date behaviour should be reused wherever appropriate
across enquiries, manual bookings, and events.

------------------------------------------------------------------------

## \[ \] Step 3 --- Event Creation Simplification

**Goal:** Make creating an event feel like creating a retreat event
rather than manually managing database inventory.

Cally should enter:

-   Event title
-   Retreat / experience
-   Start date
-   Duration or end date
-   Capacity
-   Status
-   Description

The admin should **not** enter `available_places`.

If an event has capacity 20, it starts with capacity for 20 guests.
Remaining places should be calculated by the system as bookings and
holds are created.

Event status should remain simple:

-   Draft
-   Published

------------------------------------------------------------------------

## \[ \] Step 4 --- Event Inventory & Calendar Integration

**Goal:** Make published events part of Cally's actual operational
schedule.

A **published event** commits Cally to those dates.

Those dates should therefore not also be available for a private retreat
booking or private quote hold.

A **draft event** should not consume Cally's calendar.

The admin calendar should clearly show when dates are occupied by an
event and identify the event responsible.

The system must prevent conflicting private holds/bookings from being
created over a published event, and prevent publishing an event over
already committed private inventory.

------------------------------------------------------------------------

# Phase B --- Complete the Customer Journey

## \[ \] Step 5 --- Public Event Experience

**Goal:** Give published events a proper guest-facing experience.

Published events should appear publicly as retreat options, including an
**Upcoming Events** section where appropriate.

Each published event should have its own shareable page/link suitable
for advertising.

The event page should show useful information such as:

-   Event title
-   Dates
-   Duration
-   Description
-   Capacity/remaining places where appropriate
-   Relevant experience information

The primary CTA should be:

**Book My Spot**

Opening an event does not immediately create a confirmed booking.

------------------------------------------------------------------------

## \[ \] Step 6 --- Event Enquiry & Spot Reservation

**Goal:** Connect event guests to the existing enquiry, quote, hold, and
booking system.

When a guest selects **Book My Spot**, they should submit an enquiry
tied specifically to that event.

The enquiry can include the number of places requested.

An enquiry itself does not consume event capacity.

When Cally creates a quote for the event enquiry, the requested places
become temporarily held.

Effective event availability should be calculated automatically:

**Total Capacity − Confirmed Guests − Active Held Guests = Places
Currently Available**

No administrator should manually maintain remaining-place counts.

If a quote expires or is cancelled, its held places become available
again.

------------------------------------------------------------------------

## \[ \] Step 7 --- Private Enquiry Workflow Refinement

**Goal:** Make requesting a private retreat straightforward while
preserving the bespoke nature of the experience.

The guest journey should be:

**Choose Retreat → Choose Format → Choose Dates/Duration → Submit
Enquiry**

Formats may include:

-   Solo
-   Couples
-   Private Group

The enquiry records what the guest is interested in, but it does **not**
reserve Cally's dates.

The enquiry is the beginning of the discussion.

Cally/admin can discuss and refine:

-   Retreat type
-   Format
-   Dates
-   Duration
-   Guest count
-   Other requirements

The final commercial arrangement is established when the quote is
created.

------------------------------------------------------------------------

## \[ \] Step 8 --- Payments Workflow

**Goal:** Make the payment process simple, explicit, and operationally
reliable.

The guest receives a private quote/payment link containing the agreed
commercial information and payment instructions.

The payment workflow should clearly distinguish between:

-   Amount quoted
-   Deposit required, if applicable
-   Full payment
-   Guest indicating payment has been made
-   Admin verifying payment
-   Refund state where applicable

A guest saying **I've paid** must not automatically confirm the retreat.

Cally/admin verifies that the payment has actually been received.

Only after the required payment has been verified should the booking
become eligible for confirmation.

The detailed payment rules defined for the project should be
incorporated during this dedicated pass rather than mixed into unrelated
quote or event work.

------------------------------------------------------------------------

## \[ \] Step 9 --- Booking Conversion & Confirmation

**Goal:** Make the transition from temporary reservation to confirmed
booking completely reliable.

For a private retreat:

**Quote + Hold → Payment Verified → Booking Confirmed**

The hold must become a booking without creating a moment where the dates
appear free.

For an event:

**Quoted Places Held → Payment Verified → Places Confirmed**

Event capacity must be consumed exactly once.

After successful conversion:

-   Hold becomes converted
-   Booking becomes confirmed
-   Calendar changes from Held to Booked where applicable
-   Event confirmed-place counts update correctly
-   Enquiry/quote state reflects the completed transition

------------------------------------------------------------------------

## \[ \] Step 10 --- Manual Booking Refinement

**Goal:** Keep a simple direct booking path for arrangements made
outside the normal enquiry/quote workflow.

Manual booking is appropriate for:

-   Direct arrangements with Cally
-   Existing guests
-   Offline arrangements
-   Complimentary retreats
-   Other special cases

Admin should be able to choose:

-   Retreat or event
-   Format
-   Start date
-   Duration/end date
-   Guest count
-   Payment status

A manual booking creates a genuine booking directly.

It should not require fake enquiries or fake quotes.

It must still respect:

-   Existing bookings
-   Active holds
-   Published events
-   Event capacity
-   General availability rules

------------------------------------------------------------------------

# Phase C --- Finish the Foundation

## \[ \] Step 11 --- Admin Operational Dashboard Refinement

**Goal:** Make the admin area an easy operational workspace instead of a
collection of technical records.

The admin experience should quickly answer questions such as:

-   What needs my attention?
-   Which enquiries are new?
-   Who is awaiting a quote?
-   Which quotes are awaiting payment?
-   Which quotes expire soon?
-   What dates are currently held?
-   What is booked?
-   What events are upcoming?
-   How many places remain in each event?
-   Which payments need verification?

This should primarily refine existing data and workflows.

Avoid introducing unnecessary new architecture.

------------------------------------------------------------------------

## \[ \] Step 12 --- Foundation Launch Audit

**Goal:** Prove that the complete retreat foundation is safe, coherent,
and ready for production use.

Perform a full regression and architecture audit covering:

-   Authentication and admin authorization
-   RLS policies
-   RPC/security-definer permissions
-   Direct-write bypasses
-   Quote creation
-   Quote replacement
-   Quote expiry
-   Hold creation/release/conversion
-   Private booking collisions
-   Published-event conflicts
-   Event capacity
-   Event hold capacity
-   Payment state transitions
-   Booking confirmation
-   Booking cancellation/reopening
-   Manual bookings
-   General Availability wildcard behaviour
-   Inclusive date semantics
-   Timezone/date boundaries
-   Error handling
-   Mobile admin usability
-   Migration consistency
-   Existing-data compatibility
-   Production configuration
-   Regression tests

This pass should be deliberately conservative.

Do not add unrelated features during the launch audit.

------------------------------------------------------------------------

# Final Foundation Definition

When all twelve steps are complete, the core operational system should
support two clear journeys.

## Private Retreat Journey

**Cally Opens Availability**

→ Guest chooses retreat, format, dates, and duration

→ Guest submits enquiry

→ Cally discusses/refines the request

→ Cally creates quote

→ Quote automatically holds the dates

→ Guest receives private payment link

→ Guest pays

→ Cally verifies payment

→ Cally confirms booking

→ Hold converts to booking

→ Calendar shows Booked

------------------------------------------------------------------------

## Event Journey

**Cally Creates Event**

→ Event remains Draft while being prepared

→ Cally Publishes Event

→ Event occupies Cally's dates

→ Event appears publicly with a shareable link

→ Guest selects Book My Spot

→ Guest submits event enquiry

→ Cally creates quote

→ Requested places are held

→ Guest pays

→ Cally verifies payment

→ Booking is confirmed

→ Held places become confirmed places

→ Remaining event capacity is recalculated automatically

------------------------------------------------------------------------

# Foundation Complete

After **Phase A, Phase B, and Phase C** are complete, the following
should be considered foundation functionality:

-   Availability
-   Enquiries
-   Quotes
-   Quote holds
-   Payments
-   Private bookings
-   Manual bookings
-   Events
-   Event capacity
-   Admin operational workflows
-   Public booking/enquiry journeys
-   Inventory safety
-   Launch security and data integrity

Anything beyond this point --- such as visual polish, richer content,
automated payment gateways, email automation, analytics, guest accounts,
marketing features, or additional experiences --- should be treated as
product enhancement rather than unfinished foundation.
