{
    pkgs,
    inputs,
    system,
    ...
}:
with pkgs;
mkShell {
  name = "nixos";
  NIX_CONFIG = "experimental-features = flakes nix-command pipe-operators";
  buildInputs = [
    deadnix #Dead Code Scanner
    nh #CLI wrapper for nix-shell
    nixfmt-tree #Nix code formatter
    nixos-anywhere #Disk partitioning tool for NixOS
    nixos-rebuild #NixOS system configuration rebuilder
    statix #Nix code linter

    inputs.agenix.packages.${system}.default #Agenix CLI for secrets management
  ];
}