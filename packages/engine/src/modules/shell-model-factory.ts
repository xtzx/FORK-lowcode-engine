import {
  INode,
  ISettingField,
} from '../../../designer/src';
import { IShellModelFactory, IPublicModelNode } from '../../../types/src';
import { IPublicModelSettingField } from '../../../types/src/shell/model/setting-field';
import {
  Node,
  SettingField,
} from '../../../shell/src';
class ShellModelFactory implements IShellModelFactory {
  createNode(node: INode | null | undefined): IPublicModelNode | null {
    return Node.create(node);
  }
  createSettingField(prop: ISettingField): IPublicModelSettingField {
    return SettingField.create(prop);
  }
}
export const shellModelFactory = new ShellModelFactory();