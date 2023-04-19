#!/bin/bash

echo "------------------------------"
echo "Modifying contribEqualsGreen"
echo "------------------------------"

while true ; do
    case "$1" in
        -d )
            cd $2
            shift 2
        ;;
        --dir )
            cd $2
            shift 2
        ;;
        -u )
            username=$2
            shift 2
        ;;
        --username )
            username=$2
            shift 2
        ;;
        *)
            break
        ;;
    esac 
done;

# Nuke README
sed 's/[ \t]*$//' README.md > README.md

git add README.md
git commit -m 'start with a blank slate'
git remote set-url origin git@github.com:1337hero/contribEqualsGreen.git
git push -u origin master --repo "git@github.com:1337hero/contribEqualsGreen.git"

# Add the README
echo "# Making GitHub Green
This is a simple, and fun little shell script, that just adds whitespace, then deletes white space to this README. Then it pushes to Github.

That’s all there is to it. =) " >> README.md

git add README.md
git commit -m 'put the content back'
git push -u origin master