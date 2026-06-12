"""
Focus Mode — ComfyUI custom node
Creates a focused panel view for selected nodes.
"""

import os
from aiohttp import web
from server import PromptServer

WEB_DIRECTORY = os.path.join(os.path.dirname(__file__))
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
