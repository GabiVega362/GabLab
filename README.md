<div align="center">

  <img src="assets/banner.jpg" alt="GabLab Banner" width="100%" />

  <br/><br/>

  [![NixOS](https://img.shields.io/badge/NixOS-25.11%20Unstable-5277C3?style=for-the-badge&logo=nixos&logoColor=white)](https://nixos.org)
  [![Flakes](https://img.shields.io/badge/Built%20with-Nix%20Flakes-5e81ac?style=for-the-badge&logo=nixos&logoColor=white)](https://nixos.wiki/wiki/Flakes)
  [![WireGuard](https://img.shields.io/badge/WireGuard-Mesh%20VPN-88171A?style=for-the-badge&logo=wireguard&logoColor=white)](https://wireguard.com)
  [![Caddy](https://img.shields.io/badge/Caddy-TLS%20Ingress-1F88C0?style=for-the-badge&logo=caddy&logoColor=white)](https://caddyserver.com)
  [![Security](https://img.shields.io/badge/Red%20Team-Hardened-red?style=for-the-badge&logo=hackthebox&logoColor=white)](#)

  <p align="center">
    <b>Personal Infrastructure as Code (IaC) using Nix Flakes.</b>
  </p>

  <sub><i>"Nix flakes, caffeine and existential dread."</i></sub>

</div>

---

## ⚡ About This Repo

Personal Infrastructure as Code (IaC) managing servers, gateway ingress, and network isolation from a single, fully reproducible **Nix Flake**.

- **Router / Gateway:** Edge gateway handling WireGuard tunnels, strict nftables firewall policies, local DNS resolving, and Caddy ingress with wildcard TLS.
- **Service Nodes:** Dedicated application hosts running isolated workloads without direct WAN exposure.
- **Declarative Secrets:** Encrypted secrets at rest using **Agenix**.
- **Storage Partitioning:** Declarative disk layouts powered by **Disko**.

---

## 🐅 Why Nix?

- **Zero mutable state:** Everything is declared in code; rollbacks are instantaneous.
- **Security & Sandboxing:** Ephemeral unprivileged service users (`DynamicUser`) and hardened firewalls.
- **No drift:** What is in Git is what runs in production.

---

## 🕸️ Architecture

```text
GabLab/
├── assets/                  # Brand assets & banner
├── corns/
│   ├── hosts/               # Machine-specific configurations
│   │   ├── router/          # Ingress gateway, DNS, firewall & VPN
│   │   └── spidernet/       # Isolated services & web workloads
│   └── modules/             # Reusable core modules
│       ├── boot.nix         # Kernel & bootloader definitions
│       ├── disko.nix        # Declarative GPT partition tables
│       ├── network.nix      # Base network parameters
│       └── users.nix        # Immutable user declarations
├── shells/
│   └── nixos.nix            # Reproducible development shell
├── flake.nix                # Flake entrypoint & outputs
└── secrets.nix              # Agenix encryption rules
```

---

## ⚙️ Operations

```bash
# -- Enter the nix development environment
nix develop

# -- Validate and check flake outputs
nix flake check

# -- Deploy remote host
nixos-rebuild switch \
  --flake .#<host> \
  --target-host <host>.gablab \
  --build-host <host>.gablab \
  --sudo --no-reexec
```

---

<div align="center">
  <sub>GabLab Infrastructure © 2026</sub>
</div>
