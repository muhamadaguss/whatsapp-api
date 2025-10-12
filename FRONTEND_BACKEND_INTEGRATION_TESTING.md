# 🔄 Frontend-Backend Integration Testing Guide

**Status**: Manual Testing Checklist  
**Date**: October 12, 2025  
**Branch**: feature/saas-transformation  
**Target**: Complete End-to-End User Flows

---

## 🎯 Overview

This document provides comprehensive manual testing procedures for all frontend-backend integrations in the SaaS-enabled WhatsApp Blast application.

### Testing Environment Setup

**Frontend**: http://localhost:8080 (or your configured port)  
**Backend**: http://localhost:3000  
**Database**: PostgreSQL (whatsapp_blast)

**Test Users**:
- Owner: Has full access to all features
- Admin: Can manage users and settings (not subscription)
- Member: Read-only access to most features

---

## 📋 Testing Checklist

### ✅ = Tested & Working | ⚠️ = Issues Found | ❌ = Not Tested | 🔄 = In Progress

---

## 1. 🔐 Authentication & Authorization

### 1.1 User Registration
- [ ] Navigate to registration page
- [ ] Fill in username, password, email
- [ ] Enter organization name and slug
- [ ] Click "Register"
- [ ] **Expected**: User created, organization created, auto-login
- [ ] **Verify**: User redirected to dashboard
- [ ] **Verify**: Organization shown in header/sidebar

**Test Cases**:
```
Username: testowner
Password: TestPassword123!
Organization: Test Company
Slug: test-company
Email: test@company.com
```

### 1.2 User Login
- [ ] Navigate to login page
- [ ] Enter valid credentials
- [ ] Click "Login"
- [ ] **Expected**: JWT token received and stored
- [ ] **Verify**: User redirected to dashboard
- [ ] **Verify**: User info displayed in header
- [ ] **Verify**: Organization context loaded

### 1.3 Token Validation
- [ ] Login successfully
- [ ] Refresh the page
- [ ] **Expected**: User remains logged in
- [ ] **Verify**: Token persisted in localStorage/cookie
- [ ] **Verify**: API calls include Authorization header

### 1.4 Logout
- [ ] Click logout button
- [ ] **Expected**: Token invalidated and removed
- [ ] **Verify**: Redirected to login page
- [ ] **Verify**: Cannot access protected routes
- [ ] **Verify**: Token blacklisted (try reusing it)

### 1.5 Protected Routes
- [ ] Try accessing dashboard without login
- [ ] **Expected**: Redirected to login page
- [ ] Try accessing API directly without token
- [ ] **Expected**: 401 Unauthorized

---

## 2. 🏢 Organization Management

### 2.1 Organization Dashboard
- [ ] Login as owner
- [ ] Navigate to organization dashboard
- [ ] **Verify**: Organization name displayed
- [ ] **Verify**: Subscription plan shown (Free/Starter/Pro/Enterprise)
- [ ] **Verify**: Subscription status shown (Active/Trial/Suspended)
- [ ] **Verify**: Current usage metrics displayed
- [ ] **Verify**: Team member count shown

### 2.2 Organization Settings (Owner/Admin Only)
- [ ] Navigate to organization settings
- [ ] Update organization name
- [ ] Update contact email
- [ ] Update phone number
- [ ] Update timezone
- [ ] Click "Save"
- [ ] **Expected**: Settings saved successfully
- [ ] **Verify**: Changes reflected immediately
- [ ] **Verify**: Toast/notification shown

### 2.3 Organization Switcher (Multi-Org Users)
- [ ] Create/join second organization
- [ ] Click organization switcher in header
- [ ] **Verify**: List of organizations shown
- [ ] Select different organization
- [ ] **Expected**: Page reloads with new org context
- [ ] **Verify**: Dashboard shows new org data
- [ ] **Verify**: Templates/campaigns filtered to new org
- [ ] **Verify**: JWT token updated with new organizationId

### 2.4 Organization Creation
- [ ] Click "Create New Organization"
- [ ] Fill in organization details
- [ ] **Expected**: New organization created
- [ ] **Verify**: User becomes owner of new org
- [ ] **Verify**: Auto-switched to new organization
- [ ] **Verify**: Free plan assigned by default

---

## 3. 👥 Team Management

### 3.1 Invite Team Member (Admin/Owner)
- [ ] Login as admin or owner
- [ ] Navigate to team management
- [ ] Click "Invite Member"
- [ ] Enter email and username
- [ ] Select role (Admin/Member)
- [ ] Click "Send Invite"
- [ ] **Expected**: Invitation created
- [ ] **Verify**: Member appears in team list
- [ ] **Verify**: Email notification sent (check logs)

### 3.2 View Team Members
- [ ] Navigate to team page
- [ ] **Verify**: All team members listed
- [ ] **Verify**: Roles displayed correctly (Owner/Admin/Member)
- [ ] **Verify**: Owner badge shown
- [ ] **Verify**: Last active timestamp shown
- [ ] **Verify**: Pagination works (if >10 members)

### 3.3 Change Member Role (Owner Only)
- [ ] Login as owner
- [ ] Find team member
- [ ] Click "Change Role"
- [ ] Select new role (Admin → Member or vice versa)
- [ ] Confirm change
- [ ] **Expected**: Role updated
- [ ] **Verify**: Member's permissions changed
- [ ] **Verify**: Toast notification shown

### 3.4 Remove Team Member (Admin/Owner)
- [ ] Find team member
- [ ] Click "Remove"
- [ ] Confirm removal
- [ ] **Expected**: Member removed from organization
- [ ] **Verify**: Member no longer in list
- [ ] **Verify**: Member's access revoked
- [ ] **Verify**: Cannot remove owner

### 3.5 Leave Organization (Member)
- [ ] Login as member
- [ ] Navigate to team page
- [ ] Click "Leave Organization"
- [ ] Confirm action
- [ ] **Expected**: User removed from org
- [ ] **Verify**: Redirected to org selection or creation
- [ ] **Verify**: Cannot access org data anymore

### 3.6 Permission Enforcement
- [ ] Login as member
- [ ] Try to access organization settings
- [ ] **Expected**: 403 Forbidden or UI hidden
- [ ] Try to invite users
- [ ] **Expected**: Action blocked
- [ ] Try to change subscription
- [ ] **Expected**: Action blocked

---

## 4. 💳 Subscription Management

### 4.1 View Current Subscription
- [ ] Navigate to subscription page
- [ ] **Verify**: Current plan displayed (Free/Starter/Pro/Enterprise)
- [ ] **Verify**: Billing cycle shown (Monthly/Yearly)
- [ ] **Verify**: Next billing date shown
- [ ] **Verify**: Current period usage shown
- [ ] **Verify**: Subscription status badge (Active/Trial/Cancelled)

### 4.2 View Available Plans
- [ ] Click "View Plans" or "Upgrade"
- [ ] **Verify**: All plans displayed (Free, Starter, Pro, Enterprise)
- [ ] **Verify**: Plan features listed
- [ ] **Verify**: Quota limits shown for each plan
- [ ] **Verify**: Pricing displayed
- [ ] **Verify**: Current plan highlighted

### 4.3 Upgrade Subscription
- [ ] Select higher tier plan
- [ ] Choose billing cycle (Monthly/Yearly)
- [ ] Click "Upgrade"
- [ ] Enter payment details (if payment integration exists)
- [ ] Confirm upgrade
- [ ] **Expected**: Subscription upgraded
- [ ] **Verify**: New plan shown in dashboard
- [ ] **Verify**: Quota limits increased
- [ ] **Verify**: Confirmation email sent
- [ ] **Verify**: Billing record created

### 4.4 Downgrade Subscription
- [ ] Select lower tier plan
- [ ] Click "Downgrade"
- [ ] Confirm downgrade
- [ ] **Expected**: Downgrade scheduled for end of period
- [ ] **Verify**: Warning shown about reduced features
- [ ] **Verify**: Current plan remains until period ends
- [ ] **Verify**: Notification banner shown

### 4.5 Cancel Subscription
- [ ] Click "Cancel Subscription"
- [ ] Enter cancellation reason
- [ ] Confirm cancellation
- [ ] **Expected**: Subscription marked as cancelled
- [ ] **Verify**: Access continues until period ends
- [ ] **Verify**: "Cancelled" badge shown
- [ ] **Verify**: Reactivation option available
- [ ] **Verify**: Cancellation email sent

### 4.6 Reactivate Subscription
- [ ] After cancelling, click "Reactivate"
- [ ] Confirm reactivation
- [ ] **Expected**: Subscription reactivated
- [ ] **Verify**: Status changed to "Active"
- [ ] **Verify**: Full access restored

---

## 5. 📊 Usage & Quota Monitoring

### 5.1 View Usage Dashboard
- [ ] Navigate to usage/analytics page
- [ ] **Verify**: Current period dates shown
- [ ] **Verify**: Usage metrics displayed:
  - Messages sent
  - Active WhatsApp accounts
  - Templates created
  - Storage used
- [ ] **Verify**: Quota limits shown for each metric
- [ ] **Verify**: Percentage used displayed
- [ ] **Verify**: Progress bars/charts shown

### 5.2 Quota Warning at 80%
- [ ] Increase usage to 80% of any quota
- [ ] **Expected**: Warning notification shown
- [ ] **Verify**: Yellow/orange indicator
- [ ] **Verify**: Warning message clear
- [ ] **Verify**: Suggestion to upgrade shown
- [ ] **Verify**: Email notification sent

### 5.3 Quota Critical at 95%
- [ ] Increase usage to 95% of quota
- [ ] **Expected**: Critical warning shown
- [ ] **Verify**: Red indicator
- [ ] **Verify**: Prominent banner displayed
- [ ] **Verify**: "Upgrade Now" call-to-action
- [ ] **Verify**: Email notification sent

### 5.4 Quota Exceeded at 100%
- [ ] Reach 100% of quota
- [ ] **Expected**: Operations blocked
- [ ] **Verify**: Error message when trying to create template
- [ ] **Verify**: Error message when sending message
- [ ] **Verify**: Upgrade modal shown
- [ ] **Verify**: Email notification sent
- [ ] **Verify**: Account owner notified

### 5.5 Grace Period Functionality
- [ ] Exceed quota
- [ ] **Verify**: Grace period notice shown (7 days)
- [ ] **Verify**: Countdown timer displayed
- [ ] **Verify**: Limited functionality still works
- [ ] **Verify**: Reminder emails sent daily

### 5.6 Monthly Usage Reset
- [ ] Wait for monthly reset (or manually trigger)
- [ ] **Verify**: Usage counters reset to 0
- [ ] **Verify**: Quota warnings cleared
- [ ] **Verify**: Full functionality restored
- [ ] **Verify**: Reset notification shown

### 5.7 Usage Analytics Charts
- [ ] View usage history
- [ ] **Verify**: Chart shows last 30 days
- [ ] **Verify**: Peak usage times highlighted
- [ ] **Verify**: Trend analysis shown
- [ ] **Verify**: Export option available
- [ ] **Verify**: Filters work (by date range, metric)

---

## 6. 📝 Template Management (Multi-Tenant)

### 6.1 View Templates
- [ ] Navigate to templates page
- [ ] **Verify**: Only current org templates shown
- [ ] **Verify**: Template count accurate
- [ ] **Verify**: Search/filter works
- [ ] **Verify**: Pagination works

### 6.2 Create Template
- [ ] Click "Create Template"
- [ ] Enter template name and content
- [ ] Add variables ({{name}}, {{message}})
- [ ] Click "Save"
- [ ] **Expected**: Template created
- [ ] **Verify**: Template appears in list
- [ ] **Verify**: organizationId set correctly
- [ ] **Verify**: Quota usage increased

### 6.3 Template Quota Enforcement
- [ ] Reach template quota limit
- [ ] Try to create new template
- [ ] **Expected**: Creation blocked
- [ ] **Verify**: Error message shown
- [ ] **Verify**: Quota exceeded notice
- [ ] **Verify**: Upgrade suggestion displayed

### 6.4 Edit Template
- [ ] Click edit on template
- [ ] Modify content
- [ ] Click "Save"
- [ ] **Expected**: Template updated
- [ ] **Verify**: Changes saved
- [ ] **Verify**: Version history (if implemented)

### 6.5 Delete Template
- [ ] Click delete on template
- [ ] Confirm deletion
- [ ] **Expected**: Template deleted
- [ ] **Verify**: Removed from list
- [ ] **Verify**: Quota usage decreased
- [ ] **Verify**: Soft delete (can recover if implemented)

### 6.6 Template Isolation Test
- [ ] Login as User A (Org A)
- [ ] Note template IDs
- [ ] Logout and login as User B (Org B)
- [ ] Try to access Org A template by ID
- [ ] **Expected**: 403 Forbidden or 404 Not Found
- [ ] **Verify**: Cannot see Org A templates
- [ ] **Verify**: Cannot edit Org A templates

---

## 7. 🚀 Campaign Management (Multi-Tenant)

### 7.1 Create Campaign
- [ ] Navigate to campaigns
- [ ] Click "Create Campaign"
- [ ] Select template
- [ ] Choose contacts/groups
- [ ] Schedule sending time
- [ ] Click "Create"
- [ ] **Expected**: Campaign created
- [ ] **Verify**: Campaign in list
- [ ] **Verify**: Status: "Scheduled" or "Pending"

### 7.2 View Campaign Details
- [ ] Click on campaign
- [ ] **Verify**: Campaign info displayed
- [ ] **Verify**: Message preview shown
- [ ] **Verify**: Recipient count shown
- [ ] **Verify**: Delivery status (Sent/Failed/Pending)
- [ ] **Verify**: Real-time updates via Socket.IO

### 7.3 Campaign Execution
- [ ] Start/schedule campaign
- [ ] **Verify**: Messages sent progressively
- [ ] **Verify**: Status updates in real-time
- [ ] **Verify**: Progress bar updates
- [ ] **Verify**: Success/failure counts update
- [ ] **Verify**: Message quota decreased

### 7.4 Campaign Quota Check
- [ ] Try to send campaign when quota exceeded
- [ ] **Expected**: Campaign blocked
- [ ] **Verify**: Error message shown
- [ ] **Verify**: Quota exceeded notice
- [ ] **Verify**: Cannot proceed without upgrade

---

## 8. 🔔 Notification System

### 8.1 In-App Notifications
- [ ] Trigger notification (quota warning, invite, etc.)
- [ ] **Verify**: Notification badge shown
- [ ] **Verify**: Notification list populates
- [ ] **Verify**: Click to view details
- [ ] **Verify**: Mark as read functionality
- [ ] **Verify**: Clear all option

### 8.2 Email Notifications
- [ ] Check email for:
  - Welcome email (registration)
  - Team invitation email
  - Quota warning (80%)
  - Quota critical (95%)
  - Quota exceeded (100%)
  - Subscription changes
  - Payment confirmations
- [ ] **Verify**: Emails received
- [ ] **Verify**: Content accurate
- [ ] **Verify**: Links work
- [ ] **Verify**: Unsubscribe option present

### 8.3 Webhook Notifications (if implemented)
- [ ] Configure webhook URL in settings
- [ ] Trigger events (quota exceeded, campaign complete)
- [ ] **Verify**: Webhook called
- [ ] **Verify**: Payload correct
- [ ] **Verify**: Retry on failure

---

## 9. 🔄 Real-Time Features (Socket.IO)

### 9.1 WhatsApp Connection Status
- [ ] Login to dashboard
- [ ] **Verify**: WhatsApp status badge (Connected/Disconnected)
- [ ] Disconnect WhatsApp (scan QR code flow)
- [ ] **Verify**: Status updates in real-time
- [ ] **Verify**: No page refresh needed

### 9.2 Campaign Progress Updates
- [ ] Start campaign
- [ ] **Verify**: Progress updates in real-time
- [ ] **Verify**: Message count increments
- [ ] **Verify**: Status changes without refresh
- [ ] Open campaign in two browser tabs
- [ ] **Verify**: Both tabs update simultaneously

### 9.3 Per-Tenant Socket Channels
- [ ] Login as User A (Org A)
- [ ] Start campaign
- [ ] Login as User B (Org B) in another browser
- [ ] **Verify**: User B does not see User A's updates
- [ ] **Verify**: Each org has isolated socket channel

---

## 10. 🎨 UI/UX Testing

### 10.1 Responsive Design
- [ ] Test on desktop (1920x1080)
- [ ] Test on laptop (1366x768)
- [ ] Test on tablet (768x1024)
- [ ] Test on mobile (375x667)
- [ ] **Verify**: All features accessible
- [ ] **Verify**: No horizontal scroll
- [ ] **Verify**: Touch-friendly controls

### 10.2 Loading States
- [ ] Check loading spinners
- [ ] Check skeleton screens
- [ ] Check empty states
- [ ] **Verify**: Clear feedback during operations
- [ ] **Verify**: No blank screens

### 10.3 Error Handling UI
- [ ] Trigger various errors
- [ ] **Verify**: Error messages clear
- [ ] **Verify**: Recovery actions available
- [ ] **Verify**: No stack traces shown to users
- [ ] **Verify**: Contact support option

### 10.4 Accessibility
- [ ] Test with keyboard navigation
- [ ] Test with screen reader
- [ ] Check color contrast
- [ ] **Verify**: ARIA labels present
- [ ] **Verify**: Focus indicators visible

---

## 11. 🔍 Edge Cases & Error Scenarios

### 11.1 Network Errors
- [ ] Disconnect network
- [ ] Try to perform actions
- [ ] **Expected**: Graceful error handling
- [ ] **Verify**: Offline indicator shown
- [ ] **Verify**: Retry option available
- [ ] Reconnect network
- [ ] **Verify**: Auto-retry or prompt to retry

### 11.2 Session Expiration
- [ ] Wait for token to expire (or manually expire)
- [ ] Try to perform action
- [ ] **Expected**: Redirected to login
- [ ] **Verify**: Error message shown
- [ ] **Verify**: Can resume after re-login

### 11.3 Concurrent Edits
- [ ] Open same resource in two tabs
- [ ] Edit in both tabs
- [ ] Save one, then save other
- [ ] **Verify**: Conflict detected
- [ ] **Verify**: Warning shown
- [ ] **Verify**: Resolution options provided

### 11.4 Browser Compatibility
- [ ] Test on Chrome
- [ ] Test on Firefox
- [ ] Test on Safari
- [ ] Test on Edge
- [ ] **Verify**: All features work
- [ ] **Verify**: Consistent UI rendering

---

## 📊 Test Execution Summary

### Test Statistics
```
Total Test Categories:        11
Total Test Cases:             100+
Manual Tests Required:        ~4-6 hours
Automated Tests Available:    65+ (Mocha/Chai)
```

### Test Priority
- **🔴 Critical (P0)**: Authentication, Multi-tenant isolation, Quota enforcement
- **🟡 High (P1)**: Organization management, Subscription, Team management
- **🟢 Medium (P2)**: Templates, Campaigns, Notifications
- **⚪ Low (P3)**: UI/UX polish, Edge cases

---

## 🐛 Bug Reporting Template

When issues are found, report using this format:

```markdown
**Title**: Brief description

**Priority**: Critical/High/Medium/Low

**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Expected Behavior**:
What should happen

**Actual Behavior**:
What actually happened

**Environment**:
- Browser: Chrome 118
- OS: macOS 14
- Role: Owner/Admin/Member
- Organization: Test Org

**Screenshots**:
[Attach if applicable]

**Console Errors**:
[Paste console errors if any]
```

---

## ✅ Sign-Off Checklist

Before considering frontend-backend integration complete:

- [ ] All critical (P0) tests passing
- [ ] All high priority (P1) tests passing
- [ ] Multi-tenant isolation verified
- [ ] Quota enforcement working
- [ ] Security measures validated
- [ ] Performance acceptable (<2s page loads)
- [ ] Mobile responsive
- [ ] No console errors in production
- [ ] Error handling graceful
- [ ] Documentation updated

---

**Testing Completed By**: _______________  
**Date**: _______________  
**Sign-Off**: _______________

