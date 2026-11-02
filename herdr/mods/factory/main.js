// The factory: a workspace is a folder of repos with one agent. One mod, three views by props.view:
// none = the new-workspace box, "repos" = the panel beside the agent, "add" = the repo picker.
import { View } from "gpui-kit";
import { props } from "herdr";
import { NewWorkspace } from "./new.js";
import { Add } from "./add.js";
import { Repos } from "./repos.js";

const VIEWS = { repos: Repos, add: Add };

export default class Factory extends View {
  init(_props, cx) {
    this.v = new (VIEWS[props()?.view] ?? NewWorkspace)();
    this.v.init(cx);
  }

  render(cx) { return this.v.render(cx); }
}
