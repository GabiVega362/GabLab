# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Tools                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
{  pkgs, lib, ... }:

{
# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Apps                    ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    imports =
    [ 
      ../../modules/disko.nix
      ../../modules/users.nix
      ../../modules/network.nix
      ../../modules/boot.nix
      ./esbirros/esbirros.nix
    ];


# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                 Network                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    
    networking = {
    firewall.allowedTCPPorts = [ 64022 ]; # SSH 
    defaultGateway.address = lib.mkForce "10.10.20.1"; # Override common network config
    };

    networking.interfaces = {
      ens18 = { # Local Network
        ipv4.addresses = [{
          address = "10.10.20.10";
          prefixLength = 24;
        }];
      };
    };

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   BOOT                    ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

networking.hostName = "esbirros-gablab"; # Define your hostname.

}