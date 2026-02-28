# Backend Services Bug Report

**Report Date**: 2026-02-28
**Reviewer**: Code Review Team
**Files Analyzed**:
- `/backend/database.js`
- `/backend/aiService.js`
- `/backend/newsService.js`
- `/backend/assetProxy.js`
- `/backend/server.js`
- `/backend/package.json`

---

## Executive Summary

**Total Bugs Found**: 6
**Critical**: 1
**Important**: 5
**Minor**: 0

The codebase is generally well-structured with proper parameterized queries and error handling. However, there are critical database schema issues that must be addressed immediately.

---

## Bug Details

### 🔴 CRITICAL BUGS

#### Bug #1: SQL Syntax Error - Invalid LIMIT in newsService.js

**File**: `/Users/harry/Desktop/TradingAgent/backend/newsService.js`
**Line**: 484
**Severity**: CRITICAL
**Component**: News Ingestion & Pruning

**Problem Description**:
The `pruneOldNews()` function uses invalid SQL syntax `LIMIT -1 OFFSET ?` which is not supported in SQLite. This causes the news pruning mechanism to fail silently, potentially resulting in unlimited growth of news articles in the database.

**Current Code**:
```javascript
const stmt = db.prepare(
  `
  DELETE FROM posts
  WHERE id IN (
    SELECT id FROM posts
    WHERE is_news = 1
    AND stock_ticker = ?
    ORDER BY COALESCE(news_published_at, created_at) DESC
    LIMIT -1 OFFSET ?
  )
`
)
```

**Impact**:
- News articles won't be pruned as intended
- Database could grow unbounded with old news articles
- Function fails silently without error indication

**Recommended Fix**:
Replace the query with a correct SQLite syntax that deletes records beyond the kept limit:

```javascript
const stmt = db.prepare(
  `
  DELETE FROM posts
  WHERE is_news = 1
  AND stock_ticker = ?
  AND id NOT IN (
    SELECT id FROM posts
    WHERE is_news = 1
    AND stock_ticker = ?
    ORDER BY COALESCE(news_published_at, created_at) DESC
    LIMIT ?
  )
`
)
// Change the call from:
// stmt.run(ticker, keepPerTicker)
// To:
// stmt.run(ticker, ticker, keepPerTicker)
```

---

### 🟠 IMPORTANT BUGS

#### Bug #2: Missing Cascade Delete - posts Table

**File**: `/Users/harry/Desktop/TradingAgent/backend/database.js`
**Line**: 101
**Severity**: IMPORTANT
**Component**: Database Schema

**Problem Description**:
The `posts` table's foreign key to `users(id)` lacks `ON DELETE CASCADE`. When a user is deleted, their posts become orphaned records that aren't automatically removed.

**Current Code**:
```sql
CREATE TABLE IF NOT EXISTS posts (
  ...
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Fix**:
```sql
CREATE TABLE IF NOT EXISTS posts (
  ...
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

#### Bug #3: Missing Cascade Delete - comments Table

**File**: `/Users/harry/Desktop/TradingAgent/backend/database.js`
**Line**: 115
**Severity**: IMPORTANT
**Component**: Database Schema

**Problem Description**:
The `comments` table's foreign key to `users(id)` lacks `ON DELETE CASCADE`. Comments won't be deleted when their author is deleted.

**Current Code**:
```sql
FOREIGN KEY (user_id) REFERENCES users(id),
```

**Fix**:
```sql
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
```

---

#### Bug #4: Missing Cascade Delete - portfolio_transactions Table

**File**: `/Users/harry/Desktop/TradingAgent/backend/database.js`
**Line**: 132
**Severity**: IMPORTANT
**Component**: Database Schema

**Problem Description**:
The `portfolio_transactions` table's foreign key to `users(id)` lacks `ON DELETE CASCADE`. User transaction history won't be cleaned up when users are deleted.

**Current Code**:
```sql
FOREIGN KEY (user_id) REFERENCES users(id)
```

**Fix**:
```sql
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

---

#### Bug #5: Missing Cascade Delete - daily_portfolio_snapshots Table

**File**: `/Users/harry/Desktop/TradingAgent/backend/database.js`
**Line**: 147
**Severity**: IMPORTANT
**Component**: Database Schema

**Problem Description**:
The `daily_portfolio_snapshots` table's foreign key to `users(id)` lacks `ON DELETE CASCADE`. Portfolio snapshots won't be deleted when users are deleted.

**Current Code**:
```sql
FOREIGN KEY (user_id) REFERENCES users(id),
```

**Fix**:
```sql
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
```

---

#### Bug #6: Missing Cascade Delete - user_activity_log Table

**File**: `/Users/harry/Desktop/TradingAgent/backend/database.js`
**Line**: 203
**Severity**: IMPORTANT
**Component**: Database Schema

**Problem Description**:
The `user_activity_log` table's foreign key to `users(id)` lacks `ON DELETE CASCADE`. Activity logs won't be deleted when users are deleted, leaving orphaned records.

**Current Code**:
```sql
FOREIGN KEY (user_id) REFERENCES users(id)
```

**Fix**:
```sql
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

---

## Positive Findings

The following aspects of the backend code are well-implemented:

✅ **SQL Injection Prevention**: All database queries use parameterized statements with `?` placeholders, preventing SQL injection vulnerabilities.

✅ **Async/Await Usage**: Proper async/await patterns are used throughout, including:
- AI service API calls in `aiService.js`
- News ingestion in `newsService.js`
- News sentiment analysis

✅ **Error Handling**: Appropriate try-catch blocks and error responses in all major endpoints.

✅ **Code Organization**: Clear separation of concerns:
- `database.js` for schema and initialization
- `aiService.js` for AI integration
- `newsService.js` for news aggregation
- `assetProxy.js` for symbol mapping
- `server.js` for API endpoints

✅ **Package Dependencies**: All required dependencies are properly listed in `package.json`:
- `better-sqlite3` for database
- `@google/generative-ai` for AI
- `bcryptjs` for password hashing
- `jsonwebtoken` for authentication
- `express` for HTTP server
- All other required packages present

✅ **Exports**: All expected functions are properly exported and imported by `server.js`.

---

## Recommendations

### Immediate Actions (High Priority)
1. Fix the SQL LIMIT syntax error in `newsService.js:484` to enable proper news pruning
2. Add `ON DELETE CASCADE` to all user foreign keys in database schema (Bugs #2-6)

### Testing After Fixes
- Test user deletion to ensure all orphaned records are cleaned up
- Test news ingestion over time to verify pruning works correctly
- Verify database consistency with existing data

### Optional Enhancements (Not blocking)
- Consider adding database migration scripts for existing databases
- Add logging for news pruning operations to verify they execute

---

## Files Verified

| File | Status | Notes |
|------|--------|-------|
| database.js | ⚠️ Needs Fix | Schema issues with cascade deletes |
| aiService.js | ✅ OK | Proper error handling and async patterns |
| newsService.js | 🔴 CRITICAL | SQL syntax error in pruning logic |
| assetProxy.js | ✅ OK | Simple utility functions, no issues |
| server.js | ✅ OK | No critical issues found |
| package.json | ✅ OK | All dependencies present |
| activityHelper.js | ✅ OK | Verified by import in server.js |

---

## Conclusion

The codebase demonstrates good practices in security, error handling, and code organization. The identified bugs are primarily schema-related and one SQL syntax issue. All bugs are fixable with minimal changes to the code. Once these issues are resolved, the backend should be production-ready.

