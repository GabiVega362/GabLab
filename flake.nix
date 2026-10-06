{
    description = "Self-hosted IaC (Infrastructure as Code) for GabLab";

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   INPUTS                  ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
   inputs = {
    # NixOs latest stable release
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

   # kike = {
   #     url = "github:cosadepuma/nixos";
   # }

    # Secrets management
    agenix = {
      url = "github:ryantm/agenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Disk Partitioning to be used with 'nixos-anywhere'
    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
   };

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   OUTPUTS                 ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ 
    outputs =
      { self, ... }@inputs:
        let
            system = "x86_64-linux"; #Default system architecture for the outputs
            inherit (inputs.nixpkgs) lib;
            extraArgs = {
                inherit inputs lib;
                stateVersion = "25.11";
            };

            pkgs =import inputs.nixpkgs {
                inherit system;
                config.allowUnfree = true;
            };

            nixConf = 
            nixosSystem:
            lib.nixosSystem {
                inherit system;
                modules = [
                inputs.disko.nixosModules.default
                inputs.agenix.nixosModules.default
                nixosSystem
                ];
                specialArgs = extraArgs;
            };
        in
        {
        #Development Shells
            devShells =  {
                "${system}" = {
                    default = self.devShells.${system}.nixos;
                    nixos = import ./shells/nixos.nix {inherit pkgs inputs lib system;};
                };
            };    
        #Nix Configurations for the machines
            nixosConfigurations = {
                router = nixConf ./corns/hosts/router/default.nix;
                spidernet = nixConf ./corns/hosts/spidernet/default.nix;
            }; 

        };
}