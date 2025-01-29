# This file is auto-generated during build
UI_GIT_COMMIT = "${UI_GIT_COMMIT}"
UI_GIT_BRANCH = "${UI_GIT_BRANCH}"
UI_BUILD_DATE = "${UI_BUILD_DATE}"

def get_ui_version():
    return {
        "git_commit": UI_GIT_COMMIT,
        "git_branch": UI_GIT_BRANCH,
        "build_date": UI_BUILD_DATE
    } 