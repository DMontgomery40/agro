# DO NOT MERGE THESE FILES UPSTREAM

When merging -test features back to other branches (main, live-demo, etc.), **EXCLUDE THESE FILES**:

## -specific files (keep in -test ONLY):
- `discriminative_keywords.json` - has "" keywords, not "agro"
- `semantic_keywords.json` - has "" keywords, not "agro"
- `golden.json` - has -specific test questions

## Files TO MERGE upstream:
- ✅ `gui/js/reranker.js` - THE EPIC LEARNING RERANKER
- ✅ `server/*` - any reranker backend support
- ✅ UTC time fixes in app.js/index.html
- ✅ Any other non- improvements

## When merging back, use:
```bash
# Cherry-pick approach
git checkout target-branch
git checkout -test -- gui/js/reranker.js
# ... other specific files

# OR use interactive merge and skip these files
git merge -test --no-commit
git checkout target-branch -- discriminative_keywords.json semantic_keywords.json golden.json
```
