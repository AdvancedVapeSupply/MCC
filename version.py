"""
MCT Version Information

This file tracks version information for MCT and includes patch history.
"""

__version__ = "0.2.20241212_1525"
__commit_hash__ = "abc123def456"
__commit_url__ = "https://github.com/AdvancedVapeSupply/MCT/commit/abc123def456"

# Patch history (JSON format)
patches_json = '''
{
  "0.2.20241211_1430": {
    "to_version": "0.2.20241212_1525",
    "patch": "diff --git a/version.py b/version.py\nindex abc..def 100644\n--- a/version.py\n+++ b/version.py\n@@ -1,3 +1,3 @@\n-__version__ = \"0.2.20241211_1430\"\n+__version__ = \"0.2.20241212_1525\"\n ..."
  },
  "0.2.20241210_1200": {
    "to_version": "0.2.20241211_1430",
    "patch": "... previous patch data ..."
  }
}
'''
