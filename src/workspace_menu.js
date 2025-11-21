import defaultWorkspace from "./ws_default.json";
import uavtechWorkspace from "./ws_uavtech.json";
import decrypterWorkspace from "./ws_decrypter.json";

export function WorkspaceMenu(menuElem, onSwitchWorkspace) {
  const workspace_menu = menuElem;

  function hideMenu() {
    workspace_menu.removeClass("show");
    workspace_menu.empty();
  }

  function showMenu() {
    workspace_menu.addClass("show");
  }

  this.show = function () {
    workspace_menu.empty();
    let elem = $('<div class="titleDiv bottomBorder">SELECT WORKSPACE:</div>');
    workspace_menu.append(elem);
    
    elem = $("<div>Default</div>");
    elem.click(1, ApplyWorkspace);
    workspace_menu.append(elem);
    
    elem = $("<div>UAV Tech</div>");
    elem.click(2, ApplyWorkspace);
    workspace_menu.append(elem);

    elem = $("<div>Decrypter</div>");
    elem.click(3, ApplyWorkspace);
    workspace_menu.append(elem);

    elem = $('<div class="menu-button topBorder">Close</div>');
    elem.click(ApplyWorkspace);
    workspace_menu.append(elem);
    showMenu();
  };

  this.toggle = function () {
    if (workspace_menu.hasClass("show")) {
      hideMenu();
    } else {
      this.show();
    }
  };

  function ApplyWorkspace(e) {
    switch (e.data) {
      case 1:
        onSwitchWorkspace(defaultWorkspace, 1);
        break;
      case 2:
        onSwitchWorkspace(uavtechWorkspace, 1);
        break;
      case 3:
        onSwitchWorkspace(decrypterWorkspace, 1);
        break;
    }
    hideMenu();
  }

  $(document).keydown(function (e) {
    if (e.which === 27 && workspace_menu.length > 0) {
      e.preventDefault();
      hideMenu();
    }
  });

  $(document).click(function (e) {
    if (
      workspace_menu.hasClass("show") &&
      !workspace_menu.is(e.target) &&
      workspace_menu.has(e.target).length === 0
    ) {
      hideMenu();
    }
  });

  this.getDefaultWorkspace = function () {
    return defaultWorkspace;
  };
}
