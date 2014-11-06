#!/usr/bin/env bash
#set -o errexit #abort if any command fails

# Build and publish the website to
#
# http://dcmjs.org
#
# Run from the top of the repository

my_dir="$(dirname "$0")"

source_branch=site

deploy_repo=git@github.com:commontk/dcmjs.org.git
deploy_branch=gh-pages

source "$my_dir/generate.sh"

push_website(){
  echo
  echo "Pushing website..."
  soure_repo_dir=$PWD
  cd /tmp
  repo=dcmjs.org
  git clone $deploy_repo $repo 2>/dev/null
  cd $repo
  git remote set-url origin $deploy_repo
  git pull
  git checkout $deploy_branch 2>/dev/null || git checkout -b $deploy_branch origin/$deploy_branch
  git rm -rf * 2>/dev/null
  cp -r $soure_repo_dir/$deploy_directory/* ./
  git add *
  git commit -m "Build on $(date) of commontk/dcmjs@$(cd $soure_repo_dir; git rev-parse --short HEAD)."
  git push origin $deploy_branch:$deploy_branch
  echo "Pushing website... [ok]"
}

push_website

