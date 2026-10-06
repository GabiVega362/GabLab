 let
      vegadmin = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM8o6hUHyQO8XA1y3+Fo7nIcWingKceOYb/ml3zvGzoZ admin@gablab.wtf";
      router   = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOeI1gXrbR7CFX6IfqBsvt+YRtwu3NfzyRlfEdhgnXCe root@router-gablab";
in
    {
      "corns/hosts/router/.caddy/acme.env.age".publicKeys = [ vegadmin router ];
      "corns/hosts/router/.wireguard/key.age".publicKeys = [ vegadmin router ];
      "corns/hosts/router/.wireguard/peers.conf.age".publicKeys = [ vegadmin router ];
      "corns/hosts/router/.wireguard/wireguard-profiles.conf.age".publicKeys = [ vegadmin ];
      "corns/hosts/router/.pihole/pihole.env.age".publicKeys = [ vegadmin router ];
    }