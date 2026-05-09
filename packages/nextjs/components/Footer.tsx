import React from "react";
import { SwitchTheme } from "~~/components/SwitchTheme";

/**
 * Site footer
 */
export const Footer = () => {
  return (
    <div className="min-h-0 py-5 px-1 mb-11 lg:mb-0">
      <div>
        <div className="fixed flex justify-end items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <SwitchTheme className="pointer-events-auto" />
        </div>
      </div>
      <div className="w-full">
        <ul className="menu menu-horizontal w-full">
          <div className="flex justify-center items-center gap-2 text-sm w-full flex-wrap">
            <div className="text-center font-semibold">Creature Feature &mdash; Wildlife crown game on Base</div>
            <span>·</span>
            <div className="text-center">
              <a href="https://github.com/scaffold-eth/se-2" target="_blank" rel="noreferrer" className="link">
                GitHub
              </a>
            </div>
            <span>·</span>
            <div className="text-center">
              <a
                href="https://basescan.org/address/0xa16e4054fb237cedc979b24aacdbbf6548f4617a"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                Contract on Basescan
              </a>
            </div>
            <span>·</span>
            <div className="text-center text-xs opacity-70">Every interaction funds WWF via Endaoment</div>
          </div>
        </ul>
      </div>
    </div>
  );
};
