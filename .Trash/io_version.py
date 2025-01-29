# This file is auto-generated during build
IO_GIT_COMMIT = "${IO_GIT_COMMIT}"
IO_GIT_BRANCH = "${IO_GIT_BRANCH}"
IO_BUILD_DATE = "${IO_BUILD_DATE}"

def get_io_version():
    return {
        "git_commit": IO_GIT_COMMIT,
        "git_branch": IO_GIT_BRANCH,
        "build_date": IO_BUILD_DATE
    } 