# Unipile LinkedIn API Reference

Local reference for Unipile LinkedIn API schemas and responses.
Source: https://developer.unipile.com/docs/linkedin-search

Last updated: 2026-01-17

---

## API Types

Unipile supports three LinkedIn API types, each with different capabilities:

| API Type | Description | Headcount Data | Premium Features |
|----------|-------------|----------------|------------------|
| `classic` | Basic LinkedIn | ❌ No | Basic search only |
| `sales_navigator` | LinkedIn Sales Navigator | ✅ Yes | Advanced filters, saved searches |
| `recruiter` | LinkedIn Recruiter | ✅ Yes | Full recruiting features, InMail |

**Priority for company search:** `recruiter` > `sales_navigator` > `classic`

---

## Search Categories

- `people` - Search for LinkedIn profiles
- `companies` - Search for LinkedIn company pages
- `jobs` - Search for job postings
- `posts` - Search for LinkedIn posts

---

## Company Search

### Request

```json
POST /api/v1/linkedin/search?account_id={account_id}
{
  "api": "classic" | "sales_navigator" | "recruiter",
  "category": "companies",
  "keywords": "company name",
  "limit": 5
}
```

### Response - Classic API

```json
{
  "object": "LinkedinSearch",
  "items": [
    {
      "type": "COMPANY",
      "id": "165158",
      "name": "Netflix",
      "profile_url": "https://www.linkedin.com/company/netflix",
      "summary": "Netflix is a streaming service that offers a wide variety...",
      "industry": "Entertainment Providers",
      "location": "Los Gatos, California",
      "logo": "https://media.licdn.com/dms/image/...",
      "followers_count": 11000000,
      "job_offers_count": 427
    }
  ],
  "paging": {
    "start": 0,
    "page_count": 10,
    "total_count": 100
  },
  "cursor": "next_page_cursor"
}
```

**Note:** Classic API does NOT return `headcount` field.

### Response - Sales Navigator / Recruiter API

```json
{
  "object": "LinkedinSearch",
  "items": [
    {
      "type": "COMPANY",
      "id": "75985997",
      "name": "Sisloc Softwares",
      "profile_url": "https://www.linkedin.com/company/sisloc",
      "summary": "Founded in 2008...",
      "industry": "Software Development",
      "location": "Curitiba, Paraná",
      "logo": "https://media.licdn.com/dms/image/...",
      "headcount": "152",
      "followers_count": 5000,
      "job_offers_count": 12
    }
  ],
  "paging": {
    "start": 0,
    "page_count": 10,
    "total_count": 50
  }
}
```

**Note:** Sales Navigator and Recruiter APIs return `headcount` as a string (e.g., "54", "152", "0").

---

## People Search

### Request

```json
POST /api/v1/linkedin/search?account_id={account_id}
{
  "api": "classic" | "sales_navigator" | "recruiter",
  "category": "people",
  "keywords": "software engineer",
  "location": ["103644278"],
  "title": ["Developer"],
  "skills": ["JavaScript", "React"],
  "years_of_experience": {
    "min": 3,
    "max": 10
  },
  "seniority": ["SENIOR", "DIRECTOR"],
  "limit": 25,
  "cursor": "optional_pagination_cursor"
}
```

### Response - People Search

```json
{
  "object": "LinkedinSearch",
  "items": [
    {
      "id": "abc123",
      "provider": "LINKEDIN",
      "provider_id": "ACoAABxxxxxxx",
      "public_identifier": "john-doe",
      "first_name": "John",
      "last_name": "Doe",
      "name": "John Doe",
      "headline": "Senior Software Engineer at TechCorp",
      "profile_url": "https://linkedin.com/in/john-doe",
      "profile_picture_url": "https://media.licdn.com/...",
      "location": "San Francisco, CA",
      "country": "United States",
      "current_title": "Senior Software Engineer",
      "current_company": "TechCorp",
      "current_company_id": "12345",
      "connection_degree": 2,
      "connections_count": 500,
      "mutual_connections": 15,
      "is_open_to_work": false,
      "is_premium": true
    }
  ],
  "paging": {
    "start": 0,
    "page_count": 25,
    "total_count": 1000
  },
  "cursor": "next_page_cursor"
}
```

---

## Profile Enrichment

### Request

```
GET /api/v1/users/{provider_id}?account_id={account_id}&linkedin_sections=*
```

The `linkedin_sections` parameter controls what data is returned:
- `*` - Returns ALL available sections
- Specific sections: `experience`, `about`, `skills`, `education`

### Response - Full Profile

```json
{
  "id": "abc123",
  "provider": "LINKEDIN",
  "provider_id": "ACoAABxxxxxxx",
  "public_identifier": "john-doe",
  "first_name": "John",
  "last_name": "Doe",
  "headline": "Senior Software Engineer at TechCorp",
  "summary": "Experienced software engineer with 10+ years in full-stack development...",
  "profile_url": "https://linkedin.com/in/john-doe",
  "profile_picture_url": "https://media.licdn.com/...",
  "location": "San Francisco, CA",
  "country": "United States",
  "work_experience": [
    {
      "company_id": "12345",
      "company": "TechCorp",
      "position": "Senior Software Engineer",
      "location": "San Francisco, CA",
      "start": "2020-01-01",
      "end": null,
      "description": "Led development of microservices architecture..."
    },
    {
      "company_id": "67890",
      "company": "StartupXYZ",
      "position": "Software Engineer",
      "location": "Palo Alto, CA",
      "start": "2017-06-01",
      "end": "2019-12-31",
      "description": "Built React frontend applications..."
    }
  ],
  "skills": [
    { "name": "JavaScript", "endorsements_count": 45 },
    { "name": "React", "endorsements_count": 38 },
    { "name": "Node.js", "endorsements_count": 32 },
    { "name": "TypeScript", "endorsements_count": 28 }
  ],
  "educations": [
    {
      "school_name": "Stanford University",
      "school_id": "1234",
      "degree": "Bachelor of Science",
      "field_of_study": "Computer Science",
      "start_year": 2013,
      "end_year": 2017
    }
  ],
  "connection_degree": 2,
  "connections_count": 500,
  "mutual_connections": 15,
  "is_open_to_work": false,
  "is_premium": true
}
```

**Important:** The API returns `work_experience` (not `experiences`). Skills may be returned as objects with `endorsements_count` or as simple strings.

---

## Parameter Lookup

Before using location, skill, industry, or company filters, you need to look up their IDs.

### Request

```
GET /api/v1/linkedin/search/parameters?account_id={account_id}&type={type}&keywords={query}&limit=10
```

Types: `LOCATION`, `SKILL`, `INDUSTRY`, `COMPANY`, `SCHOOL`, `SENIORITY`

### Response

```json
{
  "items": [
    {
      "id": "103644278",
      "name": "United States",
      "type": "LOCATION"
    },
    {
      "id": "90000049",
      "name": "San Francisco Bay Area",
      "type": "LOCATION"
    }
  ]
}
```

---

## Search Filters

### Available Filters by API Type

| Filter | Classic | Sales Navigator | Recruiter |
|--------|---------|-----------------|-----------|
| keywords | ✅ | ✅ | ✅ |
| location | ✅ | ✅ | ✅ |
| title | ✅ | ✅ | ✅ |
| company | ✅ | ✅ | ✅ |
| industry | ✅ | ✅ | ✅ |
| skills | ✅ | ✅ | ✅ (with priority) |
| years_of_experience | ❌ | ✅ | ✅ |
| tenure | ❌ | ✅ | ✅ |
| seniority | ❌ | ✅ | ✅ |
| network_distance | ✅ | ✅ | ✅ |
| role (structured) | ❌ | ❌ | ✅ |

### Seniority Values

- `ENTRY` - Entry level
- `SENIOR` - Senior
- `MANAGER` - Manager
- `DIRECTOR` - Director
- `VP` - Vice President
- `CXO` - C-Level Executive
- `PARTNER` - Partner
- `OWNER` - Owner

### Recruiter-Specific Filters

Skills with priority:
```json
{
  "skills": [
    { "id": "12345", "priority": "MUST_HAVE" },
    { "id": "67890", "priority": "DOESNT_HAVE" }
  ]
}
```

Role with scope:
```json
{
  "role": [
    {
      "keywords": "developer OR engineer",
      "priority": "MUST_HAVE",
      "scope": "CURRENT"
    }
  ]
}
```

Scope values: `CURRENT`, `PAST`, `CURRENT_OR_PAST`

---

## Pagination

All search endpoints support cursor-based pagination:

1. First request: Don't include `cursor`
2. Check response for `cursor` field
3. Next request: Include `cursor` from previous response
4. Continue until no `cursor` returned or `items` is empty

```json
// First request
{ "keywords": "engineer", "limit": 25 }

// Response includes cursor
{ "items": [...], "cursor": "abc123xyz" }

// Second request
{ "keywords": "engineer", "limit": 25, "cursor": "abc123xyz" }
```

---

## Rate Limits

- Respect LinkedIn's rate limits
- Recommended delays between requests: 1000ms
- Batch operations: Process in groups of 5-10 with delays between batches
- Error 429: Rate limit exceeded - implement exponential backoff

---

## Messaging API

### Send Message (1st degree connection)

```json
POST /api/v1/chats/message
{
  "account_id": "your_account_id",
  "attendee_provider_id": "ACoAABxxxxxxx",
  "text": "Hello, I'd like to connect..."
}
```

### Send InMail (2nd/3rd degree)

```json
POST /api/v1/chats/inmail
{
  "account_id": "your_account_id",
  "attendee_provider_id": "ACoAABxxxxxxx",
  "subject": "Exciting opportunity",
  "text": "Hi, I came across your profile..."
}
```

### Send Connection Request

```json
POST /api/v1/users/{provider_id}/invite
{
  "account_id": "your_account_id",
  "provider_id": "ACoAABxxxxxxx",
  "message": "I'd like to add you to my network."
}
```

Note: Connection request message limit is 300 characters.

---

## Field Mapping Summary

| Unipile Field | Our Field | Notes |
|---------------|-----------|-------|
| `work_experience` | `experiences` | Normalized on fetch |
| `work_experience[].position` | `experiences[].title` | Position → Title |
| `work_experience[].company` | `experiences[].company_name` | Company → Company Name |
| `skills` (object array) | `skills` (string array) | Extract `.name` from objects |
| `headcount` (string) | `headcount` (number) | Parse string to int |
| `followers_count` | `followers` | Direct mapping |

---

## Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Process response |
| 400 | Bad request | Check request format |
| 401 | Unauthorized | Check API key |
| 403 | Forbidden | API type not available for account |
| 404 | Not found | Resource doesn't exist |
| 429 | Rate limited | Wait and retry with backoff |
| 500 | Server error | Retry after delay |

---

## Implementation Notes

1. **Company Headcount:**
   - Only available via Sales Navigator or Recruiter API
   - Classic API: Estimate from `followers_count`
   - Estimation formula in `UnipileClient.companyToInfo()`

2. **Profile Enrichment:**
   - Always use `linkedin_sections=*` for full data
   - API returns `work_experience`, we normalize to `experiences`
   - Skills may be objects or strings

3. **API Selection:**
   - Check account capabilities with test search
   - Cache capabilities for 1 hour
   - Prefer: recruiter > sales_navigator > classic
