# GitHub Contribution Generator

A super simple tool to keep your GitHub activity graph looking alive by making small tweaks to this README every day. It alternates between adding and removing whitespace, making a commit each time. (Don't actually use this!!)

## How It Works

Here's the deal:

1. The script adds trailing whitespace to each line in this README.
2. It commits and pushes the changes.
3. Then it strips the trailing whitespace.
4. Another commit and push happen.

That's two contributions to your GitHub graph every time it runs. Easy peasy.

## What You’ll Need

- Git set up with SSH access to GitHub.
- Node.js installed.
- A Linux system with systemd (if you want it to run automatically).

## Getting Started

1. Clone the repo:
   ```bash
   git clone https://github.com/1337hero/contribEqualsGreen.git
   cd contribEqualsGreen
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Make the script executable:
   ```bash
   chmod +x contrib.sh
   ```

## Running It Manually

Just fire it up whenever you want:
```bash
npm start
```

## Setting It Up to Run Daily (Linux/systemd)

Want it to run every day without you lifting a finger? Here’s how to set up a systemd timer:

1. Create a service file at `/etc/systemd/system/github-contrib.service`:
   ```ini
   [Unit]
   Description=GitHub Contribution Generator
   After=network-online.target
   Wants=network-online.target
   
   [Service]
   Type=oneshot
   User=YOUR_USERNAME
   WorkingDirectory=/path/to/contribEqualsGreen
   Environment=PATH=/usr/local/bin:/usr/bin:/bin
   ExecStart=/usr/bin/node runContrib.js
   
   [Install]
   WantedBy=multi-user.target
   ```

2. Create a timer file at `/etc/systemd/system/github-contrib.timer`:
   ```ini
   [Unit]
   Description=Run GitHub Contribution Generator Daily
   
   [Timer]
   OnCalendar=*-*-* 00:00:00
   Persistent=true
   
   [Install]
   WantedBy=timers.target
   ```

3. Enable and start the timer:
   ```bash
   sudo systemctl enable github-contrib.timer
   sudo systemctl start github-contrib.timer
   ```

4. Check that it’s running:
   ```bash
   systemctl status github-contrib.timer
   ```

### Turning It Off

Need to stop the automation? No problem.

1. Disable and stop the timer/service:
   ```bash
   sudo systemctl stop github-contrib.timer
   sudo systemctl stop github-contrib.service
   sudo systemctl disable github-contrib.timer
   sudo systemctl disable github-contrib.service
   ```

2. Delete the systemd files:
   ```bash
   sudo rm /etc/systemd/system/github-contrib.timer
   sudo rm /etc/systemd/system/github-contrib.service
   ```

3. Reload systemd:
   ```bash
   sudo systemctl daemon-reload
   ```

## A Few Things to Keep in Mind

- Replace `YOUR_USERNAME` in the service file with your Linux username.
- Update the `WorkingDirectory` path to wherever you cloned this repo.
- Make sure your Git SSH keys are set up right.
- If this is just for fun, maybe use a separate GitHub account for the automation.

## Just a Heads-Up

This is a fun little project for learning and experimentation. Don’t forget to check GitHub’s terms of service when using automation like this.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
