#!/usr/bin/env bash
#set -o errexit #abort if any command fails

# Build the website
#
# Run from the top of the repository

deploy_directory=_site

# url to use for CNAME file generation
site_url=dcmjs.org

# Parse arg flags
while : ; do
	if [[ $1 = "-v" || $1 = "--verbose" ]]; then
		verbose=true
		shift
	else
		break
	fi
done

#echo expanded commands as they are executed (for debugging)
function enable_expanded_output {
  if [ $verbose ]; then
    set -o xtrace
    set +o verbose
  fi
}

#this is used to avoid outputting the repo URL, which may contain a secret token
function disable_expanded_output {
  if [ $verbose ]; then
    set +o xtrace
    set -o verbose
  fi
}

enable_expanded_output

clear_website() {
  echo
  echo "Removing $deploy_directory ..."
  [ -d ./$deploy_directory ] && rm -r $deploy_directory
  echo "Removing $deploy_directory ... [ok]"
}

generate_website() {
  echo
  echo "Generating website..."

  mkdir -p $deploy_directory

	# Fake generation of the website
	for file in $(find . -type d \( -name $deploy_directory -o -name '.git' \) -prune -o \
	                     -type f \( -name deploy.sh -o -name generate.sh \) -prune -o \
	                     -print); do
	  [ "$file" != "." ] && cp -r --parents $file $deploy_directory
	done

	# Generate CNAME
	echo $site_url > $deploy_directory/CNAME

  echo "Generating website... [ok]"
}

clear_website
generate_website

