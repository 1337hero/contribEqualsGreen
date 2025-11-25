#!/bin/zsh

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

# Add trailing whitespace to each line
sed -i 's/$/ /' README.md

git add README.md
git commit -m 'add whitespace'
git push

# Remove trailing whitespace from each line
sed -i 's/[[:space:]]*$//' README.md

git add README.md
git commit -m 'remove whitespace'
git push