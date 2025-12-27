# Zephyr Scale Integration Guide

## Overview

ThriveIQ can automatically create test cases in Zephyr Scale (formerly Zephyr Squad Cloud) with full test steps when you generate and apply work items from requirements analysis.

## Prerequisites

1. **Zephyr Scale Cloud** must be installed in your Jira Cloud instance
2. You need a **Zephyr Scale API token** (separate from your Jira API token)

## Getting Your Zephyr Scale API Token

1. Log in to Jira Cloud
2. Click on your profile icon (top right)
3. Go to **Settings** → **Zephyr Scale API Access Tokens**
   - Or navigate directly to: `https://[your-domain].atlassian.net/plugins/servlet/ac/com.kanoah.test-manager/api-tokens-page`
4. Click **Create Token**
5. Give it a descriptive name (e.g., "ThriveIQ Integration")
6. Copy the generated token immediately (you won't be able to see it again)

## Configuration in ThriveIQ

### Step 1: Configure Jira Integration

1. Go to **Integrations** page in ThriveIQ
2. Click **Add Integration** or edit an existing Jira integration
3. Fill in the basic Jira fields:
   - Base URL (e.g., `https://your-domain.atlassian.net`)
   - Project Key
   - Email
   - Jira API Token

### Step 2: Configure Test Cases Mapping

1. Scroll to **Test Cases Mapping** section
2. Select **"Create as Zephyr Test Cases"** from the dropdown
3. A new field will appear: **Zephyr Scale API Token (required)**
4. Paste the API token you copied earlier
5. Save the integration

### Optional: Test Case Issue Type

The "Test Case Issue Type" field is now optional and primarily for documentation. When creating Zephyr test cases via the API, this field is not used. However, if you switch back to creating Jira native test cases, this field will be used.

## How It Works

When you apply changes with test cases enabled:

1. **Test Case Creation**: Each test case is created in Zephyr Scale with:
   - **Name**: Formatted as "Given [condition], When [action], Then [expected result]"
   - **Objective**: Clear description of what's being tested
   - **Test Steps**: Automatically broken down into 3 steps:
     - Step 1: Given (precondition)
     - Step 2: When (action)
     - Step 3: Then (expected result with verification)

2. **Automatic Linking**: Test cases are automatically linked to the parent Jira story using the `issueLinks` field

3. **Project Association**: All test cases are correctly associated with the specified Jira project

## Viewing Test Cases in Zephyr Scale

After test cases are created:

1. Open the Jira issue (user story) that was updated
2. Scroll to the **Zephyr Scale** section
3. You should see all created test cases listed
4. Click on any test case to view the detailed test steps

Alternatively, navigate to:
- **Zephyr Scale** → **Test Cases** (from the Jira sidebar)
- Filter by project to see all test cases

## Troubleshooting

### Test Cases Not Appearing in Zephyr

**Issue**: Test cases are created but don't show in the Zephyr Scale section

**Solutions**:
1. **Check API Token**: Ensure the Zephyr Scale API token is correct and has not expired
2. **Verify Permissions**: Your Jira/Zephyr user must have permission to create test cases
3. **Check Zephyr License**: Ensure your Zephyr Scale license is active
4. **Project Configuration**: Verify the project is properly configured in Zephyr Scale

### API Token Errors

**Issue**: "Unauthorized" or "Invalid token" errors

**Solutions**:
1. Regenerate the Zephyr Scale API token
2. Ensure you're using the **Zephyr Scale API token**, not the Jira API token
3. Check that the token hasn't been deleted or expired

### Test Cases Created as Plain Jira Issues

**Issue**: Test cases appear as regular Jira issues without test steps

**Solutions**:
1. **Verify Zephyr API Token**: Make sure you've entered the Zephyr Scale API token in the integration configuration
2. **Check Mapping Selection**: Confirm "Create as Zephyr Test Cases" is selected in the Test Cases Mapping dropdown
3. **Review Logs**: Check the application logs for any Zephyr API errors

### Link Not Working

**Issue**: Test cases are created but not linked to the parent story

**Solutions**:
1. This is usually a non-critical issue - test cases are still created
2. You can manually link them in Jira using the "Link" feature
3. Check that the Jira project has the "Tests" or "Relates" link types enabled

## API Reference

ThriveIQ uses the **Zephyr Scale Cloud API v2**:
- Base URL: `https://api.zephyrscale.smartbear.com/v2`
- Authentication: Bearer token (your Zephyr Scale API token)
- Endpoint: `POST /testcases`

For more details, see the [official Zephyr Scale API documentation](https://support.smartbear.com/zephyr-scale-cloud/api-docs/).

## Example Test Case Structure

When you generate test cases from requirements, they're created in Zephyr with this structure:

```json
{
  "projectKey": "PROJ",
  "name": "Given a user is logged in, When they click logout, Then they should be redirected to login page",
  "objective": "Verify: Given a user is logged in, When they click logout, Then they should be redirected to login page",
  "testScript": {
    "type": "STEP_BY_STEP",
    "steps": [
      {
        "description": "Given a user is logged in",
        "expectedResult": "Precondition is met"
      },
      {
        "description": "When they click logout",
        "expectedResult": "Action is performed"
      },
      {
        "description": "Then they should be redirected to login page",
        "expectedResult": "User is redirected to login page"
      }
    ]
  },
  "issueLinks": ["PROJ-123"]
}
```

## Migration from Jira Native Test Cases

If you previously used Jira native test cases and want to switch to Zephyr:

1. Update your integration configuration to include the Zephyr Scale API token
2. Change the Test Cases Mapping to "Create as Zephyr Test Cases"
3. New test cases will be created in Zephyr Scale with proper test steps
4. Existing Jira test issues can remain as-is or be manually migrated

## Best Practices

1. **API Token Security**: Store your Zephyr Scale API token securely and don't share it
2. **Token Rotation**: Periodically regenerate API tokens for security
3. **Permissions**: Use a service account or dedicated integration user for API tokens
4. **Testing**: After configuration, test the integration with a sample work item before bulk operations
5. **Monitoring**: Check the application logs after applying changes to ensure test cases are created successfully

## Support

For issues specific to:
- **ThriveIQ Integration**: Check application logs or contact your team lead
- **Zephyr Scale API**: Refer to [SmartBear support](https://support.smartbear.com/zephyr-scale-cloud/)
- **Jira Configuration**: Contact your Jira administrator

