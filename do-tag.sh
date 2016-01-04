#!/bin/bash
set -e

version="$1"

if [ -z "$version" ]; then
    echo "No version specified"
    exit 1
fi

tag="v$version"

# Delete tag if already present
git tag -d "$tag" || true
git push origin ":refs/tags/$tag" || true
git tag "$tag"
git push --tags

