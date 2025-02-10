#!/bin/bash

# Check for Homebrew and install if not present
if ! command -v brew &> /dev/null; then
    echo "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "Homebrew is already installed."
fi

# Install jq
echo "Installing jq..."
brew install jq

# Install Git
echo "Installing Git..."
brew install git

# Install Curl
echo "Installing Curl..."
brew install curl

# Install Node.js
echo "Installing Node.js..."
brew install node

# Install Python
echo "Installing Python..."
brew install python

echo "Setup complete!"
