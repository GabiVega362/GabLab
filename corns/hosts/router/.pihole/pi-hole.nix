{ config, lib, pkgs, ... }:

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Services                ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
{
    services = {
        pihole-ftl = {
            enable = true;
            lists = [
            {
                url = "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts";
                type = "block";
                enabled = true;
                description = "List of hosts to block, compiled from various reputable sources.";
            }
            ];
            openFirewallDNS = false;
            openFirewallDHCP = false;
            openFirewallWebserver = false;
            queryLogDeleter.enable = true;
            settings = {
            # misc.readOnly = false;
            dns = {
                domain = "gablab.wtf";
                domainNeeded = true;
                expandHosts = true;
                listeningMode = "LOCAL";
                hosts = [
                    "192.168.1.3   router.gablab.wtf pihole.gablab.wtf pairdrop.gablab.wtf vpn.gablab.wtf "
                    "10.10.10.254  vpn.gablab.wtf welcome.gablab.wtf"  
                ];
                upstreams = ["192.168.1.1" "1.1.1.1" "1.0.0.1"];
            };
            ntp = {
                ipv4.active = true;
                ipv6.active = false;
                sync.active = false;
            };
            webserver = {
                session = {
                timeout = 43200; # 12h
                };
            };
            };
            useDnsmasqConfig = true;
    };

    pihole-web = {
      enable = true;
      ports = [8088];
    };

    # Desactivar el stub de systemd-resolved para liberar el puerto 53 (DNS)
        resolved = {
            settings = {
            Resolve = {
                DNSStubListener = "no";
                MulticastDNS = "off";
            };
            };
        };

    };
    
    age.secrets."pihole.env".file = ./pihole.env.age;

    systemd.services.pihole-ftl.serviceConfig.EnvironmentFile = config.age.secrets."pihole.env".path;

    # Parche declarativo para corregir el bug de upstream de Pi-hole 6.4 en NixOS
      systemd.services.pihole-ftl-setup.script = lib.mkForce (
        builtins.replaceStrings [ "PostFTLData \"lists\"" ] [ "PostFTLData \"lists?type=block\"" ]
          (import (pkgs.path + "/nixos/modules/services/networking/pihole-ftl-setup-script.nix") {
            cfg = config.services.pihole-ftl;
            inherit config lib pkgs;
          })
      );
}